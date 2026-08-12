#!/usr/bin/env bash
#
# Connects the instance to Cloudflare, so that voice.rxstudio.co.uk resolves to
# it without a single inbound port being open. cloudflared dials out and holds
# the connection; Cloudflare sends requests back down it.
#
#   ./tunnel.sh login    authorise this machine against the zone (browser)
#   ./tunnel.sh create   create the tunnel and start it as a service
#   ./tunnel.sh dns      point voice.rxstudio.co.uk at it   <- changes live DNS
#   ./tunnel.sh status   what the tunnel and the service think
#
# The Cloudflare credentials never leave the instance. Run the steps in order;
# the last one is separate because it is the one that moves live traffic.
#
set -euo pipefail
. "$(dirname "$0")/lib.sh"
state_load

: "${TUNNEL_NAME:=$STACK_NAME}"
: "${HOSTNAME_FQDN:=voice.rxstudio.co.uk}"
: "${ORIGIN:=http://127.0.0.1:8080}"

cmd="${1:-help}"

case "$cmd" in

login)
  # cloudflared prints a URL and then waits. There is no browser on the box, so
  # it runs detached and we relay the URL to whoever is reading this.
  say "starting the authorisation request"
  ssh_ "rm -f ~/cf-login.log ~/.cloudflared/cert.pem
        nohup cloudflared tunnel login > ~/cf-login.log 2>&1 &
        sleep 4; true"

  url=""
  for _ in $(seq 1 20); do
    url="$(ssh_ "grep -o 'https://[^ ]*' ~/cf-login.log | head -1" || true)"
    [ -n "$url" ] && break
    sleep 2
  done
  [ -n "$url" ] || { ssh_ "cat ~/cf-login.log"; die "cloudflared printed no URL."; }

  echo
  echo "  Open this and pick the rxstudio.co.uk zone:"
  echo
  echo "    $url"
  echo
  say "waiting for you to authorise"
  for _ in $(seq 1 120); do
    if ssh_ "test -f ~/.cloudflared/cert.pem" 2>/dev/null; then
      say "authorised"
      exit 0
    fi
    sleep 5
  done
  die "timed out. Rerun ./tunnel.sh login."
  ;;

create)
  ssh_ "test -f ~/.cloudflared/cert.pem" || die "Not authorised yet. Run ./tunnel.sh login."

  # cloudflared pretty-prints its JSON, so the pattern has to tolerate the space
  # after the colon. The first "id" in the document is the tunnel's own; the
  # ones further down belong to its connections.
  read_id() {
    ssh_ "cloudflared tunnel list --name '$TUNNEL_NAME' --output json 2>/dev/null \
          | sed -n 's/.*\"id\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' | head -1"
  }

  TUNNEL_ID="$(read_id || true)"
  if [ -z "$TUNNEL_ID" ]; then
    say "creating tunnel '$TUNNEL_NAME'"
    ssh_ "cloudflared tunnel create '$TUNNEL_NAME'"
    TUNNEL_ID="$(read_id || true)"
  else
    say "reusing tunnel '$TUNNEL_NAME'"
  fi
  [ -n "$TUNNEL_ID" ] || die "Could not read the tunnel id back."
  say "tunnel $TUNNEL_ID"
  state_put TUNNEL_ID "$TUNNEL_ID"

  say "writing /etc/cloudflared/config.yml"
  ssh_ "sudo install -d -m 0755 /etc/cloudflared
        sudo install -m 0600 -o root -g root ~/.cloudflared/$TUNNEL_ID.json /etc/cloudflared/$TUNNEL_ID.json
        sudo tee /etc/cloudflared/config.yml >/dev/null <<'YAML'
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json

# Local only, for ./tunnel.sh status.
metrics: 127.0.0.1:20241

originRequest:
  connectTimeout: 10s
  # A call holds its relay socket open for as long as the call lasts, up to
  # MAX_CALL_SECONDS. Nothing here may decide that a busy socket is idle.
  tcpKeepAlive: 30s
  keepAliveTimeout: 90s
  noTLSVerify: false

ingress:
  # Twilio's media relay and the phone app both arrive on this name; the
  # WebSocket upgrade rides the same route as the REST calls.
  - hostname: $HOSTNAME_FQDN
    service: $ORIGIN
  - service: http_status:404
YAML"

  say "installing the cloudflared service"
  ssh_ "sudo systemctl stop cloudflared 2>/dev/null || true
        sudo cloudflared --config /etc/cloudflared/config.yml service install 2>/dev/null || true
        sudo systemctl enable --now cloudflared"
  sleep 4
  ssh_ "systemctl is-active cloudflared" >/dev/null \
    && say "cloudflared is running" \
    || { ssh_ "sudo journalctl -u cloudflared -n 30 --no-pager"; die "cloudflared did not start."; }

  say "next:  ./tunnel.sh dns   (this is the step that moves live traffic)"
  ;;

dns)
  [ -n "${TUNNEL_ID:-}" ] || die "No tunnel yet. Run ./tunnel.sh create."
  warn "This repoints $HOSTNAME_FQDN at the tunnel, replacing the record it has now."
  printf 'Type the hostname to confirm: '
  read -r typed
  [ "$typed" = "$HOSTNAME_FQDN" ] || die "stopped"

  ssh_ "cloudflared tunnel route dns --overwrite-dns '$TUNNEL_NAME' '$HOSTNAME_FQDN'"
  say "$HOSTNAME_FQDN now resolves through the tunnel"
  ;;

status)
  ssh_ "echo '--- cloudflared ---'; systemctl is-active cloudflared; \
        sudo journalctl -u cloudflared -n 15 --no-pager; \
        echo; echo '--- $SERVICE ---'; systemctl is-active $SERVICE; \
        curl -s --max-time 5 http://127.0.0.1:8080/health; echo"
  ;;

*)
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  ;;
esac
