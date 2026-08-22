# Deploying

The server runs on one small Ubuntu box, published through a Cloudflare tunnel. Nothing listens on the public internet:
`cloudflared` dials out from the instance and Cloudflare sends requests back
down that connection, so the only inbound port in the whole deployment is SSH.

```
Twilio  ──wss──┐
                ├──► Cloudflare edge ──► cloudflared (outbound) ──► 127.0.0.1:8080
Android app ───┘        voice.rxstudio.co.uk
```

## What is where

| | |
|---|---|
| `/opt/voicecall` | the code, replaced wholesale on every deploy |
| `/var/lib/voicecall` | `calls.db` and `profile.json` — never touched by a deploy |
| `/etc/voicecall/voicecall.env` | the secrets, `0600 root:root`, read by systemd before it drops privileges |
| `/etc/cloudflared/` | the tunnel credentials and ingress rules |
| `voicecall.service` | the app, running as an unprivileged account with a read-only filesystem |
| `cloudflared.service` | the tunnel |

Code and state are deliberately in different places. `deploy.sh` mirrors
`/opt/voicecall`, and a database living inside it would be deleted by an
ordinary deploy.

## First run

Two routes to a box. Both end at the same place — a plain Ubuntu host with Node
24, `cloudflared` and a service account — and everything after that is identical.

- **Any provider** — you create the box, `./adopt.sh` prepares it. Start here
  unless you specifically want Oracle's free tier.
- **Oracle Cloud** — `./oci-provision.sh` creates it and prepares it in one go,
  on the Always Free allowance. Documented further down.

Either way you need a Cloudflare account that already holds the `rxstudio.co.uk`
zone.

### Any provider

Create a VPS: Ubuntu 24.04, 1 GB of memory is enough, London if your numbers are
UK ones — the media path is Twilio to this box and back, so the region it sits in
is audible. Add your public key at creation so there is no password to type.

If the console offers a **user data** field, paste `cloud-init.yaml` into it and
the box arrives ready. If it does not, or the box already exists, adopt it:

```bash
./adopt.sh 203.0.113.10                 # ubuntu@, Oracle and most images
SSH_USER=root ./adopt.sh 203.0.113.10   # Hetzner, Vultr, Linode default
```

`adopt.sh` is the same base image said over ssh instead of at first boot. It is
safe to re-run and checks before each step, so adopting a box that already had
`cloud-init.yaml` does almost nothing. It also drops the Oracle identifiers from
`.state`, which describe a machine that is no longer yours.

Then carry on at **From here, both routes are the same** below.

### Oracle Cloud

You need the OCI CLI and a Cloudflare account that already holds the
`rxstudio.co.uk` zone.

**1. Authorise the CLI.** Opens a browser; nothing is stored beyond the session.

```bash
oci session authenticate
```

Pick your **home region** — Always Free capacity exists only there, so anywhere
else is a billable instance. The scripts stop and ask if the two disagree.

**2. Build the instance.** Creates a VCN, a public subnet, a gateway, a security
list that admits SSH and nothing else, and the instance itself. First boot
installs Node 24, `cloudflared` and `fail2ban` via `cloud-init.yaml`.

```bash
./oci-provision.sh
```

Free Ampere capacity is usually exhausted, and `Out of host capacity` is the
normal answer rather than a fault. The script works through every availability
domain and retries; leave it running, or stop it and start again later. Nothing
is left half-built.

Domains the tenancy cannot launch in at all answer `NotAuthorizedOrNotFound`
instead, and those are dropped from the rotation rather than retried — in
`uk-london-1`, AD-3 is one of them.

When a region has nothing to give, ask for less, wait longer, or take the other
free shape:

```bash
OCPUS=1 MEM_GB=6 ./oci-provision.sh                      # a quarter of the allowance
LAUNCH_ATTEMPTS=60 LAUNCH_BACKOFF=180 ./oci-provision.sh # three patient hours
SHAPE=VM.Standard.E2.1.Micro ./oci-provision.sh          # x86, 1 GB, usually free
```

The last one is a different architecture, which costs nothing here — the server
is pure JavaScript with no native dependencies — and the script drops
`--shape-config` by itself, since only the `.Flex` shapes are sized at launch.
1 GB of RAM is tight but workable for a process that spends its life waiting on
sockets.

### From here, both routes are the same

**3. Ship the code.**

```bash
./deploy.sh
```

Reads `server/.env` for the configuration, so whatever works locally is what
runs on the server. Add `--with-data` once if you want the existing call history
to come along.

**4. Publish it.**

```bash
./tunnel.sh login     # prints a URL — open it, pick the rxstudio.co.uk zone
./tunnel.sh create    # creates the tunnel, starts it as a service
./tunnel.sh dns       # points voice.rxstudio.co.uk at it
```

`dns` is separate from `create` because it is the step that moves live traffic.
Everything before it is invisible to anyone using the service.

**5. Check it from outside.**

```bash
./verify.sh
```

Health, the two legal documents Google Play requires to be public, an
unauthenticated request being refused, and — the one that matters — the
WebSocket upgrade on `/relay` surviving both Cloudflare and the tunnel. A call
fails at the first syllable if that last one does not hold.

## Afterwards

```bash
./deploy.sh                                   # ship a change
./tunnel.sh status                            # is anything running
ssh -i ~/.ssh/id_ed25519_oci ubuntu@<ip>      # get in
sudo journalctl -u voicecall -f               # watch it work
```

## Notes

**Every knob is an environment variable.** `lib.sh` holds the defaults —
instance size, CIDRs, paths, the hostname. Override any of them inline:
`OCPUS=2 MEM_GB=12 ./oci-provision.sh`.

**The scripts are re-runnable.** Each one looks for what it would have created
and reuses it, so an interrupted run is fixed by running it again.

**`.state`** is written next to the scripts and remembers the instance id, its
address and the tunnel id, so the later scripts need no arguments. It holds no
secrets, but it is specific to your tenancy — keep it out of version control.

**SSH is open to the world**, because a laptop's address moves. Passwords are
off, root login is off, and `fail2ban` bans after five failures. Narrow the
ingress rule to your own address if the machine is going to sit still.

**The app binds `0.0.0.0:8080`.** Reachable only through the tunnel, since both
the OCI security list and the instance's own firewall drop everything else, but
`server.listen(config.port, '127.0.0.1')` in `src/index.js` would close it at
the source if you would rather not rely on two layers agreeing.

**Twilio never needs the instance's address.** It dials
`wss://voice.rxstudio.co.uk/relay`, which is what `PUBLIC_HOST` in `.env` says.
Rebuilding the instance changes its IP and nothing else — the tunnel reconnects
under the same name and Twilio is none the wiser.

## Selling calls

Calls are paid for in credits — one credit is one call that connects, and one
that nobody answers is refunded automatically. `TRIAL_CALLS` is what a new
account gets for free, once. Until `PLAY_PACKS` is set nothing is for sale, the
app shows no shop, and accounts simply run out at the end of their trial: that
is a working state, and a fine one to launch in while the Play listing is still
in review.

Turning the shop on is four steps, three of them in the Play Console:

1. **Create the products.** Monetise > Products > In-app products, one
   *consumable* product per pack. Consumable is the important word — the app
   consumes each purchase after delivering it, which is what lets the same pack
   be bought again. Set the price there; it is the only place a price is ever
   set, and the app reads it back rather than storing its own copy.
2. **Make a service account** in Google Cloud, and grant it access under Play
   Console > Users and permissions with *View financial data*. Download its JSON
   key onto the instance, outside the repo, readable only by the service user.
3. **Point `.env` at both**: `PLAY_PACKAGE_NAME=com.voicecall`,
   `PLAY_SERVICE_ACCOUNT_FILE=/path/to/key.json`, and `PLAY_PACKS` as
   `productId:calls` pairs matching step 1 — e.g. `calls10:10,calls30:30`.
4. **Restart, and test with a licence tester account** (Play Console > Setup >
   Licence testing) before the listing is live. Testers buy for free and the
   whole path still runs, verification included.

The server asks Google about every purchase before crediting anything, so a
purchase token the app made up buys nothing. It also credits any given order id
exactly once, which is what makes the app's retry-on-next-launch safe: a
purchase that was paid for but never delivered — the app was killed, the network
went — is picked up and sent again the next time the plan screen opens.

**Prices are not in this repo and should not be.** Play sets them per country
and currency, and `TRIAL_CALLS` aside, nothing here assumes what a call sells
for. What a call *costs* is a different number and already visible: the plan
screen itemises it per call, straight from what Twilio charged.

### The second rail: Stripe on the web

Play is not the only way in. `/pay` is a web page taking cards, WeChat Pay and
Alipay, opened from a thirty-minute link the app hands out. It exists for two
reasons Play cannot cover: those last two payment methods are not available
through Play Billing on a UK account and are what a good part of this audience
actually uses, and the link can be **sent to whoever is paying** — a parent in
another country with no UK card is the case it was built for.

Both rails write to the same ledger, so a call bought either way is the same
call. Turning it on:

1. **Create a Price per pack** in the Stripe dashboard. As with Play, the amount
   lives there and the server only records how many calls each one buys.
2. **Add a webhook endpoint** at `https://<PUBLIC_HOST>/stripe/webhook`,
   subscribed to `checkout.session.completed` and
   `checkout.session.async_payment_succeeded` — the second is not optional,
   because WeChat Pay and Alipay settle minutes after the browser comes back.
3. **Enable WeChat Pay and Alipay** under Settings > Payment methods. They are
   off by default.
4. **Fill in** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PACKS`
   as `priceId:calls` pairs. Blank leaves the app showing Play alone.

Credits land on the signed webhook and nowhere else — the redirect after paying
is a page the payer can reload, bookmark or never reach, and it says nothing
about whether money moved. Signatures are checked against a five-minute window,
so a captured request cannot be replayed back later, and the checkout session id
is the idempotency key, so a redelivered event pays out once.

**Two things to know before switching this on.** Stripe is not merchant of
record, so **VAT is yours**: selling to UK consumers under the registration
threshold there is nothing to do, but digital services to EU consumers have no
threshold at all and are registrable from the first sale — Google and Paddle
handle that for you and Stripe does not. And if the app ever links out to this
page from inside itself, that falls under Play's Billing Choice programme and
carries a service fee on anything bought within 24 hours; the app deliberately
does not do that today, it hands over a link to open or to send.
