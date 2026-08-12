# Shared settings and helpers for the deploy scripts. Sourced, not run.
#
# Every knob is an environment variable with a default, so the common case is
# `./oci-provision.sh` with nothing set and the unusual case is one export.

# Git Bash rewrites arguments that look like paths ("/16" inside a CIDR, JMESPath
# starting with a slash). Off, or half the OCI calls arrive mangled.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

# --- what we build -----------------------------------------------------------
: "${STACK_NAME:=smartvoice}"
: "${OCI_PROFILE:=DEFAULT}"

# Always Free Ampere. The whole free allowance is 4 OCPU / 24 GB across all A1
# instances, and this spends it on one. Drop to 2/12 if you want a second box —
# or if every availability domain keeps answering "out of host capacity", which
# is the usual reason a launch fails.
: "${SHAPE:=VM.Standard.A1.Flex}"
: "${OCPUS:=4}"
: "${MEM_GB:=24}"
: "${BOOT_GB:=50}"

: "${OS_NAME:=Canonical Ubuntu}"
: "${OS_VERSION:=24.04}"

: "${VCN_CIDR:=10.0.0.0/16}"
: "${SUBNET_CIDR:=10.0.1.0/24}"

# A key that exists only for this box, so revoking it costs nothing else.
: "${SSH_KEY:=$HOME/.ssh/id_ed25519_oci}"
: "${SSH_USER:=ubuntu}"

# --- where things live on the instance ---------------------------------------
# Code and state are deliberately apart: deploy.sh mirrors APP_DIR and would
# happily delete a database that lived inside it.
: "${APP_DIR:=/opt/voicecall}"
: "${DATA_DIR:=/var/lib/voicecall}"
: "${ENV_FILE:=/etc/voicecall/voicecall.env}"
: "${SERVICE:=voicecall}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$HERE/.." && pwd)"
STATE_FILE="$HERE/.state"

# --- helpers -----------------------------------------------------------------
say()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!!\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[31mxx\033[0m  %s\n' "$*" >&2; exit 1; }

# The CLI is a venv on Windows and usually on PATH elsewhere.
if [ -z "${OCI:-}" ]; then
  if command -v oci >/dev/null 2>&1; then OCI=oci
  elif [ -x "/c/o/Scripts/oci.exe" ]; then OCI="/c/o/Scripts/oci.exe"
  elif [ -x "$HOME/bin/oci" ]; then OCI="$HOME/bin/oci"
  fi
fi

# `oci session authenticate` leaves a browser-issued token rather than an API
# key, and the CLI will not reach for it unless told. Profiles set up the other
# way (`oci setup config`) have no security_token_file and need no flag.
OCI_AUTH=()
if grep -q '^[[:space:]]*security_token_file' "${OCI_CLI_CONFIG_FILE:-$HOME/.oci/config}" 2>/dev/null; then
  OCI_AUTH=(--auth security_token)
fi

oci_() {
  [ -n "${OCI:-}" ] || die "oci CLI not found. Install it, or set OCI=/path/to/oci."
  "$OCI" --profile "$OCI_PROFILE" "${OCI_AUTH[@]}" "$@"
}

# The CLI is a native Windows program under Git Bash and cannot open /d/... , so
# any path handed to it as an argument goes through here first. A no-op on Linux
# and macOS.
winpath() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

# JMESPath query that yields empty rather than exploding when nothing matched.
oci_q() { oci_ "$@" --raw-output 2>/dev/null || true; }

# Remember what we created so the later scripts need no arguments.
state_put() {
  local key="$1" value="$2"
  [ -f "$STATE_FILE" ] || : > "$STATE_FILE"
  grep -v "^${key}=" "$STATE_FILE" > "$STATE_FILE.tmp" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$value" >> "$STATE_FILE.tmp"
  mv "$STATE_FILE.tmp" "$STATE_FILE"
}

state_load() { [ -f "$STATE_FILE" ] && . "$STATE_FILE" || true; }

ssh_() {
  [ -n "${INSTANCE_IP:-}" ] || die "No instance IP. Run ./oci-provision.sh first, or export INSTANCE_IP."
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
      "$SSH_USER@$INSTANCE_IP" "$@"
}
