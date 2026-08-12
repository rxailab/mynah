#!/usr/bin/env bash
#
# Pushes the current working tree to the instance and restarts the service.
# Run it as often as you like — it is the ordinary way to ship a change.
#
#   ./deploy.sh              code, .env, unit file, restart
#   ./deploy.sh --with-data  also copy the local call history, once
#
# The call history and the profile live in /var/lib/voicecall and are never
# touched, so a deploy cannot lose them.
#
set -euo pipefail
. "$(dirname "$0")/lib.sh"
state_load

WITH_DATA=no
[ "${1:-}" = "--with-data" ] && WITH_DATA=yes

[ -f "$SERVER_DIR/.env" ] || die "No $SERVER_DIR/.env to deploy."

say "target $SSH_USER@$INSTANCE_IP"

# --- code --------------------------------------------------------------------
# tar over ssh rather than rsync: Git Bash ships one of those and not the other.
# Staged and swapped so a half-finished transfer never becomes the running copy,
# and so files deleted locally also disappear on the server.
say "uploading src, scripts, package manifests"
# /opt belongs to root, so the staging directory is made with sudo and handed
# over; everything after that runs as the ordinary login user.
tar -czf - -C "$SERVER_DIR" src scripts package.json package-lock.json \
  | ssh_ "set -e
      sudo rm -rf $APP_DIR.staging $APP_DIR.old
      sudo install -d -m 0755 -o $SSH_USER -g $SSH_USER $APP_DIR.staging
      tar -xzf - -C $APP_DIR.staging
      # The service runs as an unprivileged account that is not the one this
      # tar was extracted by, so the code has to be readable by everybody.
      # Modes cannot be trusted to survive the trip: a working tree on a
      # filesystem with no Unix permissions — an exFAT external disk, a Windows
      # checkout — hands tar 0600 for every file, and the service then dies with
      # 'Cannot find module' on a file that is plainly there.
      chmod -R a+rX $APP_DIR.staging"

# node_modules is worth carrying across when the lockfile has not moved; npm ci
# on one free ARM core is a couple of minutes, and most deploys are code-only.
say "installing dependencies if the lockfile moved"
ssh_ "set -e
  cd $APP_DIR.staging
  if [ -d $APP_DIR/node_modules ] && cmp -s $APP_DIR/package-lock.json package-lock.json; then
    mv $APP_DIR/node_modules ./node_modules
    echo '  dependencies unchanged, reusing'
  fi
  [ -d $APP_DIR ] && sudo mv $APP_DIR $APP_DIR.old || true
  sudo mv $APP_DIR.staging $APP_DIR
  cd $APP_DIR
  if [ ! -d node_modules ]; then
    echo '  npm ci'
    npm ci --omit=dev --no-audit --no-fund
  fi
  sudo rm -rf $APP_DIR.old"

# --- configuration -----------------------------------------------------------
# The local .env is the source of truth. Comments and blanks are dropped because
# systemd's parser is stricter than dotenv's, and the BOM Windows editors leave
# on the first line would otherwise become part of the first variable's name.
say "writing $ENV_FILE"
sed -e '1s/^\xEF\xBB\xBF//' -e 's/\r$//' "$SERVER_DIR/.env" \
  | grep -vE '^[[:space:]]*(#|$)' \
  | ssh_ "sudo tee $ENV_FILE >/dev/null && sudo chown root:root $ENV_FILE && sudo chmod 600 $ENV_FILE"

say "installing the systemd unit"
ssh_ "sudo tee /etc/systemd/system/$SERVICE.service >/dev/null" < "$HERE/voicecall.service"
ssh_ "sudo systemctl daemon-reload && sudo systemctl enable $SERVICE >/dev/null"

# --- state -------------------------------------------------------------------
if [ "$WITH_DATA" = yes ]; then
  [ -f "$SERVER_DIR/data/calls.db" ] || die "No local data/calls.db to copy."
  warn "copying local call history over whatever is on the server"
  ssh_ "sudo systemctl stop $SERVICE || true"
  tar -czf - -C "$SERVER_DIR/data" calls.db $( [ -f "$SERVER_DIR/data/profile.json" ] && echo profile.json ) \
    | ssh_ "sudo tar -xzf - -C $DATA_DIR && sudo chown -R voicecall:voicecall $DATA_DIR"
fi

# --- run ---------------------------------------------------------------------
say "restarting $SERVICE"
ssh_ "sudo systemctl restart $SERVICE"
sleep 3

if ssh_ "curl -sf --max-time 5 http://127.0.0.1:8080/health"; then
  echo
  say "healthy"
else
  echo
  warn "no health response — last 40 lines of the log:"
  ssh_ "sudo journalctl -u $SERVICE -n 40 --no-pager"
  exit 1
fi

ssh_ "systemctl is-active $SERVICE >/dev/null && echo && systemctl status $SERVICE --no-pager -n 5" || true
