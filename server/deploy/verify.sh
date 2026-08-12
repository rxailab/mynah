#!/usr/bin/env bash
#
# Checks the deployment from outside, the way Twilio and the phone app see it.
# Everything goes over the public name, so a pass means the whole chain —
# Cloudflare, the tunnel, the service — is working, not just the process.
#
#   ./verify.sh
#
set -euo pipefail
. "$(dirname "$0")/lib.sh"
state_load

: "${HOSTNAME_FQDN:=voice.rxstudio.co.uk}"
BASE="https://$HOSTNAME_FQDN"
fails=0

# Where the requests come from.
#
# Some networks reset connections to Cloudflare's edge, and on one of those a
# local failure would say nothing about the deployment. So probe once, and fall
# back to running the checks on the instance — which is still a real round trip
# out to Cloudflare and back down the tunnel, not a shortcut to localhost.
if curl -sf --max-time 10 -o /dev/null "$BASE/health" 2>/dev/null; then
  FROM=local
  run() { bash -c "$1"; }
  say "$BASE — checking from this machine"
else
  FROM=instance
  run() { ssh_ "$1"; }
  warn "this machine cannot reach $HOSTNAME_FQDN — checking from the instance instead"
  say "$BASE — checking from $INSTANCE_IP"
fi

check() {
  local label="$1" cmd="$2"
  printf '  %-34s' "$label"
  if run "$cmd" >/tmp/verify.out 2>&1; then
    printf '\033[32mok\033[0m\n'
  else
    printf '\033[31mFAILED\033[0m\n'
    sed 's/^/      /' /tmp/verify.out | head -6
    fails=$((fails + 1))
  fi
}

check "health" \
  "curl -sf --max-time 15 '$BASE/health' | grep -q '\"ok\":true'"

# Google Play requires these to be reachable by anyone, unauthenticated.
check "legal/terms is public" \
  "curl -sf --max-time 15 -o /dev/null '$BASE/legal/terms'"
check "legal/privacy is public" \
  "curl -sf --max-time 15 -o /dev/null '$BASE/legal/privacy'"

# The app reads its sign-in options from here before showing the buttons.
check "auth methods" \
  "curl -sf --max-time 15 -o /dev/null '$BASE/api/auth/methods'"

# The API must refuse an unauthenticated caller rather than answer one.
check "api rejects no token" \
  "test \"\$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' '$BASE/api/calls')\" = 401"

# The one that actually matters: Twilio dials wss://…/relay, and the call is
# dead on arrival if the upgrade does not survive Cloudflare and the tunnel.
#
# --http1.1 is not optional. Cloudflare offers HTTP/2, where Connection/Upgrade
# carry no meaning, and the request would arrive at Express as an ordinary GET
# and be answered 404 — upgrades are handled below the router. Real clients,
# Twilio's included, do the handshake over HTTP/1.1; without this flag the check
# fails on a working deployment.
WS_HDRS="--http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=='"
# The key above is the one from RFC 6455, so a correct server answers with the
# accept value in the same example: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
check "wss upgrade on /relay" \
  "curl -sS -i -N --max-time 10 $WS_HDRS '$BASE/relay?ref=verify' 2>&1 | grep -qi 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='"

# An /app socket with no session token must be turned away at the upgrade, and
# be legible about it: the app needs to tell "sign in again" from "the network
# is down". Both halves are asserted, because the refusal once arrived as a 502
# — index.js was writing the status line and destroying the socket, and the
# tunnel reported that truncated response upstream as a gateway error.
check "wss /app refuses no token" \
  "! curl -sS -i -N --max-time 10 $WS_HDRS '$BASE/app?ref=verify' 2>&1 | grep -qi '101 switching'"
check "  ...and says 401, not 502" \
  "curl -sS -i -N --max-time 10 $WS_HDRS '$BASE/app?ref=verify' 2>&1 | grep -qi '401 unauthorized'"

if [ -n "${INSTANCE_IP:-}" ]; then
  echo
  say "on the instance"
  # These are about the box itself, so they run there whatever FROM says.
  ion() { ssh_ "$1"; }
  icheck() {
    local label="$1" cmd="$2"
    printf '  %-34s' "$label"
    if ion "$cmd" >/tmp/verify.out 2>&1; then
      printf '\033[32mok\033[0m\n'
    else
      printf '\033[31mFAILED\033[0m\n'
      sed 's/^/      /' /tmp/verify.out | head -6
      fails=$((fails + 1))
    fi
  }
  icheck "voicecall service active"   "systemctl is-active $SERVICE >/dev/null"
  icheck "cloudflared active"         "systemctl is-active cloudflared >/dev/null"
  icheck "both survive a reboot"      "systemctl is-enabled $SERVICE cloudflared >/dev/null"
  icheck "tunnel has edge connections" "sudo journalctl -u cloudflared --no-pager | grep -c 'Registered tunnel connection' | grep -qv '^0$'"
  # journalctl prints '-- No entries --' when it finds nothing, which is not an
  # entry. Strip the lines it uses to talk about itself before counting.
  icheck "no errors in the last hour" \
    "! sudo journalctl -u $SERVICE --since -1h -p err --no-pager | grep -v '^-- ' | grep -q ."
fi

echo
if [ "$fails" -eq 0 ]; then
  say "all checks passed (from $FROM)"
else
  die "$fails check(s) failed"
fi
