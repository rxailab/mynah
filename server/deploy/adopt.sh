#!/usr/bin/env bash
# Takes a plain Ubuntu box — from any provider — and makes it the deploy target.
#
# oci-provision.sh creates an instance and hands it cloud-init.yaml in one go.
# That only works on Oracle. This is the other half of the same idea for
# everywhere else: you create the box yourself, in whatever console, and this
# brings it to the same state cloud-init would have, then writes .state so
# deploy.sh and tunnel.sh can find it.
#
# Safe to re-run. Every step checks before it acts, so adopting a box that was
# created *with* cloud-init.yaml as user-data does almost nothing.
#
#   ./adopt.sh 203.0.113.10                 # ubuntu@, the usual
#   SSH_USER=root ./adopt.sh 203.0.113.10   # Hetzner, Vultr, Linode default
#
# Afterwards:
#   ./tunnel.sh login && ./tunnel.sh create
#   ./deploy.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib.sh"

IP="${1:-}"
[ -n "$IP" ] || die "Usage: ./adopt.sh <ip>   (SSH_USER=root for most providers)"

say "target $SSH_USER@$IP"
INSTANCE_IP="$IP"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
    "$SSH_USER@$IP" "echo reachable" >/dev/null \
  || die "Cannot ssh in. Add $SSH_KEY.pub to the box first, or set SSH_USER."

# Everything below is the cloud-init file, said again over ssh. Kept as one
# heredoc rather than a series of round trips so that a slow link does not turn
# provisioning into a minutes-long conversation.
say "bringing the box up to the base image"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$IP" 'sudo bash -s' <<'REMOTE'
set -euo pipefail

cat > /usr/local/sbin/apt-wait <<'WAIT'
#!/bin/bash
set -e
for _ in $(seq 1 60); do
  if ! fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 &&
     ! fuser /var/lib/apt/lists/lock >/dev/null 2>&1; then
    exec apt-get -o DPkg::Lock::Timeout=300 "$@"
  fi
  sleep 5
done
exec apt-get -o DPkg::Lock::Timeout=300 "$@"
WAIT
chmod 0755 /usr/local/sbin/apt-wait

/usr/local/sbin/apt-wait update
/usr/local/sbin/apt-wait install -y ca-certificates curl gnupg unzip fail2ban

# Swap, for the same reason cloud-init makes it: npm ci can exhaust a 1 GB box.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Node 24: node:sqlite needs 22.5 at the very least, and 24 is the first release
# where it is not behind a flag.
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  /usr/local/sbin/apt-wait install -y nodejs
fi

if ! command -v cloudflared >/dev/null; then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    > /etc/apt/sources.list.d/cloudflared.list
  /usr/local/sbin/apt-wait update
  /usr/local/sbin/apt-wait install -y cloudflared
fi

# The service account owns state and nothing else: no shell, nothing to log in to.
id voicecall >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin \
  --home-dir /var/lib/voicecall voicecall

# Whoever we ssh in as owns the code directory, because deploy.sh writes it.
DEPLOY_USER="${SUDO_USER:-root}"
install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /opt/voicecall
install -d -m 0750 -o voicecall -g voicecall /var/lib/voicecall
install -d -m 0700 -o root -g root /etc/voicecall

# sshd takes the FIRST value it sees for a keyword, not the last, and reads
# sshd_config.d in lexical order. Cloud images ship 50-cloud-init.conf with
# PasswordAuthentication yes, which therefore beats anything written at 99 —
# so hardening that only adds a file leaves password login quietly enabled.
# Seen on a Vultr Ubuntu 26.04 box: sshd -T said yes with both files present.
for f in /etc/ssh/sshd_config.d/*.conf; do
  [ -e "$f" ] || continue
  case "$f" in */99-hardening.conf) continue;; esac
  if grep -qiE '^\s*PasswordAuthentication\s+yes' "$f"; then
    if [ "$(grep -cvE '^\s*(#|$)' "$f")" -eq 1 ]; then
      mv "$f" "$f.disabled"          # nothing else in it worth keeping
    else
      sed -i -E 's/^(\s*PasswordAuthentication\s+yes)/#\1/I' "$f"
    fi
  fi
done

cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'HARDEN'
PasswordAuthentication no
KbdInteractiveAuthentication no
HARDEN
# PermitRootLogin is deliberately absent: on providers whose only account is
# root, cloud-init's version of this file locks you out of your own box.
[ "${SUDO_USER:-root}" = "root" ] || echo 'PermitRootLogin no' >> /etc/ssh/sshd_config.d/99-hardening.conf

cat > /etc/fail2ban/jail.d/sshd.local <<'JAIL'
[sshd]
enabled = true
maxretry = 5
bantime  = 1h
JAIL

sshd -t || { echo 'sshd config is invalid; not restarting' >&2; exit 1; }
systemctl restart ssh 2>/dev/null || systemctl restart sshd
sshd -T 2>/dev/null | grep -qi '^passwordauthentication no' \
  || echo 'WARNING: password login is still enabled — check /etc/ssh/sshd_config.d' >&2
systemctl enable --now fail2ban >/dev/null 2>&1 || true

node --version
REMOTE

# The Oracle identifiers describe a machine that is no longer ours. Left behind
# they read as current, and the next person to open .state has no way to know
# which lines still mean something. TUNNEL_ID stays: a Cloudflare tunnel belongs
# to the account, not to the box, and tunnel.sh looks it up by name anyway.
for stale in INSTANCE_ID COMPARTMENT SUBNET_ID; do
  grep -v "^${stale}=" "$STATE_FILE" > "$STATE_FILE.tmp" 2>/dev/null || true
  mv "$STATE_FILE.tmp" "$STATE_FILE" 2>/dev/null || true
done

state_put INSTANCE_IP "$IP"
state_put SSH_USER "$SSH_USER"
say "adopted — .state now points at $IP"
echo
echo "next:"
echo "  ./tunnel.sh login && ./tunnel.sh create   # re-point voice.rxstudio.co.uk"
echo "  ./deploy.sh"
