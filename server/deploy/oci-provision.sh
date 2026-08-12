#!/usr/bin/env bash
#
# Builds the network and the instance. Safe to run again: every step looks for
# what it would have created and reuses it, so a run that died halfway through
# picks up where it stopped rather than making a second copy of everything.
#
#   ./oci-provision.sh
#
set -euo pipefail
. "$(dirname "$0")/lib.sh"

# --- credentials -------------------------------------------------------------
CONFIG="${OCI_CLI_CONFIG_FILE:-$HOME/.oci/config}"
[ -f "$CONFIG" ] || die "No $CONFIG. Run:  $OCI session authenticate"

# The tenancy OCID is in the config the login wrote; no reason to ask for it.
TENANCY="$(awk -v p="[$OCI_PROFILE]" '
  $0 == p { inside = 1; next }
  /^\[/   { inside = 0 }
  inside && /^[[:space:]]*tenancy[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }
' "$CONFIG")"
[ -n "$TENANCY" ] || die "No 'tenancy' under [$OCI_PROFILE] in $CONFIG."

: "${COMPARTMENT:=$TENANCY}"

REGION="$(oci_q iam region-subscription list --query 'data[?"is-home-region"] | [0]."region-name"')"
say "tenancy ${TENANCY: -12}, home region ${REGION:-unknown}"

# Always Free capacity only exists in the home region, so being anywhere else is
# a bill rather than an error, and worth stopping over.
CUR_REGION="$(awk -v p="[$OCI_PROFILE]" '
  $0 == p { inside = 1; next } /^\[/ { inside = 0 }
  inside && /^[[:space:]]*region[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }
' "$CONFIG")"
if [ -n "$REGION" ] && [ -n "$CUR_REGION" ] && [ "$REGION" != "$CUR_REGION" ]; then
  warn "profile region is $CUR_REGION but the home region is $REGION."
  warn "Always Free capacity lives in the home region only — this will be billable."
  printf 'Continue anyway? [y/N] '; read -r reply
  case "$reply" in y|Y|yes) ;; *) die "stopped" ;; esac
fi

# --- ssh key -----------------------------------------------------------------
if [ ! -f "$SSH_KEY" ]; then
  say "generating $SSH_KEY"
  ssh-keygen -t ed25519 -N '' -f "$SSH_KEY" -C "$STACK_NAME-oci" >/dev/null
fi
[ -f "$SSH_KEY.pub" ] || die "$SSH_KEY exists but $SSH_KEY.pub does not."

# --- network -----------------------------------------------------------------
VCN_ID="$(oci_q network vcn list -c "$COMPARTMENT" --display-name "$STACK_NAME-vcn" \
          --lifecycle-state AVAILABLE --query 'data[0].id')"
if [ -z "$VCN_ID" ]; then
  say "creating VCN $STACK_NAME-vcn ($VCN_CIDR)"
  VCN_ID="$(oci_ network vcn create -c "$COMPARTMENT" \
            --cidr-blocks "[\"$VCN_CIDR\"]" \
            --display-name "$STACK_NAME-vcn" \
            --dns-label "$(printf '%s' "$STACK_NAME" | tr -cd '[:alnum:]' | cut -c1-15)" \
            --wait-for-state AVAILABLE --query 'data.id' --raw-output)"
else
  say "reusing VCN ${VCN_ID: -12}"
fi

IGW_ID="$(oci_q network internet-gateway list -c "$COMPARTMENT" --vcn-id "$VCN_ID" \
          --display-name "$STACK_NAME-igw" --query 'data[0].id')"
if [ -z "$IGW_ID" ]; then
  say "creating internet gateway"
  IGW_ID="$(oci_ network internet-gateway create -c "$COMPARTMENT" --vcn-id "$VCN_ID" \
            --is-enabled true --display-name "$STACK_NAME-igw" \
            --wait-for-state AVAILABLE --query 'data.id' --raw-output)"
fi

RT_ID="$(oci_q network vcn get --vcn-id "$VCN_ID" --query 'data."default-route-table-id"')"
say "pointing the default route at the gateway"
oci_ network route-table update --rt-id "$RT_ID" --force \
  --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$IGW_ID\"}]" \
  >/dev/null

# Inbound: SSH and nothing else. The site is served through an outbound tunnel,
# so 80 and 443 never need to be open — see tunnel.sh.
SL_ID="$(oci_q network vcn get --vcn-id "$VCN_ID" --query 'data."default-security-list-id"')"
say "security list: inbound 22 only"
oci_ network security-list update --security-list-id "$SL_ID" --force \
  --ingress-security-rules '[
    {"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","isStateless":false,
     "tcpOptions":{"destinationPortRange":{"min":22,"max":22}},
     "description":"ssh"},
    {"protocol":"1","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","isStateless":false,
     "icmpOptions":{"type":3,"code":4},
     "description":"path mtu discovery"}
  ]' \
  --egress-security-rules '[
    {"protocol":"all","destination":"0.0.0.0/0","destinationType":"CIDR_BLOCK","isStateless":false,
     "description":"outbound, including the cloudflared tunnel"}
  ]' >/dev/null

SUBNET_ID="$(oci_q network subnet list -c "$COMPARTMENT" --vcn-id "$VCN_ID" \
             --display-name "$STACK_NAME-public" --lifecycle-state AVAILABLE --query 'data[0].id')"
if [ -z "$SUBNET_ID" ]; then
  say "creating subnet $SUBNET_CIDR"
  SUBNET_ID="$(oci_ network subnet create -c "$COMPARTMENT" --vcn-id "$VCN_ID" \
               --cidr-block "$SUBNET_CIDR" --display-name "$STACK_NAME-public" \
               --dns-label pub --route-table-id "$RT_ID" --security-list-ids "[\"$SL_ID\"]" \
               --prohibit-public-ip-on-vnic false \
               --wait-for-state AVAILABLE --query 'data.id' --raw-output)"
fi

# --- image -------------------------------------------------------------------
# Filtering by shape is what keeps this on the aarch64 build; the same OS name
# and version also exist for x86 and the two are not interchangeable.
IMAGE_ID="$(oci_q compute image list -c "$COMPARTMENT" \
            --operating-system "$OS_NAME" --operating-system-version "$OS_VERSION" \
            --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC \
            --query 'data[0].id')"
[ -n "$IMAGE_ID" ] || die "No $OS_NAME $OS_VERSION image for $SHAPE in this region."
say "image ${IMAGE_ID: -12}"

# --- instance ----------------------------------------------------------------
INSTANCE_ID="$(oci_q compute instance list -c "$COMPARTMENT" --display-name "$STACK_NAME" \
               --lifecycle-state RUNNING --query 'data[0].id')"

if [ -z "$INSTANCE_ID" ]; then
  ADS="$(oci_q iam availability-domain list -c "$COMPARTMENT" --query "join(' ', data[*].name)")"
  [ -n "$ADS" ] || die "Could not list availability domains."

  # Only the Flex shapes are sized at launch. The fixed ones — E2.1.Micro, the
  # other Always Free option — reject --shape-config outright.
  SHAPE_ARGS=()
  case "$SHAPE" in
    *.Flex)
      SHAPE_ARGS=(--shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEM_GB}")
      say "launching $SHAPE with $OCPUS OCPU / ${MEM_GB}GB" ;;
    *)
      say "launching $SHAPE (fixed size)" ;;
  esac
  # Two different failures wear similar clothes here.
  #
  # "Out of host capacity" is the normal answer for free Ampere, not a fault:
  # that domain is worth asking again in a minute.
  #
  # NotAuthorizedOrNotFound means this tenancy cannot launch in that domain at
  # all — the IAM listing includes domains you may not actually use — so asking
  # again will never help and it drops out of the rotation. Only when every
  # domain has dropped out is it a real permissions problem worth stopping over.
  INSTANCE_ID=""
  usable="$ADS"
  for attempt in $(seq 1 "${LAUNCH_ATTEMPTS:-20}"); do
    still_worth_trying=""
    for AD in $usable; do
      say "attempt $attempt in $AD"
      if INSTANCE_ID="$(oci_ compute instance launch -c "$COMPARTMENT" \
            --availability-domain "$AD" \
            --shape "$SHAPE" \
            "${SHAPE_ARGS[@]}" \
            --image-id "$IMAGE_ID" \
            --subnet-id "$SUBNET_ID" \
            --assign-public-ip true \
            --display-name "$STACK_NAME" \
            --boot-volume-size-in-gbs "$BOOT_GB" \
            --ssh-authorized-keys-file "$(winpath "$SSH_KEY.pub")" \
            --user-data-file "$(winpath "$HERE/cloud-init.yaml")" \
            --wait-for-state RUNNING \
            --query 'data.id' --raw-output 2>/tmp/launch.err)"; then
        break 2
      fi
      INSTANCE_ID=""
      if grep -qi 'out of host capacity\|LimitExceeded\|TooManyRequests' /tmp/launch.err; then
        warn "$AD has no free capacity right now"
        still_worth_trying="$still_worth_trying $AD"
      elif grep -qi 'NotAuthorizedOrNotFound' /tmp/launch.err; then
        warn "$AD is not open to this tenancy — dropping it"
      else
        cat /tmp/launch.err >&2
        die "launch failed for a reason that is neither capacity nor availability"
      fi
    done

    usable="$(printf '%s' "$still_worth_trying" | sed 's/^ *//')"
    [ -n "$usable" ] || die "No availability domain in $REGION will accept this launch. Check that the tenancy may use $SHAPE."

    # A browser session lasts an hour and this loop can outlive it. `session
    # refresh` takes no --auth flag, so it bypasses the wrapper.
    [ ${#OCI_AUTH[@]} -eq 0 ] || "$OCI" --profile "$OCI_PROFILE" session refresh >/dev/null 2>&1 || true
    sleep "${LAUNCH_BACKOFF:-90}"
  done
  [ -n "$INSTANCE_ID" ] || die "No capacity in$usable after ${LAUNCH_ATTEMPTS:-20} rounds. Try again later, or ask for less: OCPUS=1 MEM_GB=6 ./oci-provision.sh"
else
  say "reusing instance ${INSTANCE_ID: -12}"
fi

INSTANCE_IP="$(oci_q compute instance list-vnics --instance-id "$INSTANCE_ID" \
               --query 'data[0]."public-ip"')"
[ -n "$INSTANCE_IP" ] || die "Instance is running but has no public IP."

state_put INSTANCE_ID "$INSTANCE_ID"
state_put INSTANCE_IP "$INSTANCE_IP"
state_put COMPARTMENT "$COMPARTMENT"
state_put SUBNET_ID "$SUBNET_ID"

# --- wait for first boot -----------------------------------------------------
say "waiting for cloud-init (Node and cloudflared are installing)"
for _ in $(seq 1 60); do
  if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
         -o BatchMode=yes "$SSH_USER@$INSTANCE_IP" \
         'test -f /var/log/cloud-init-ready' 2>/dev/null; then
    break
  fi
  sleep 15
done

say "instance ready at $INSTANCE_IP"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$INSTANCE_IP" \
    'echo "  node $(node --version), cloudflared $(cloudflared --version 2>/dev/null | head -1)"' || \
    warn "cloud-init has not finished yet; give it a few minutes and check: ssh -i $SSH_KEY $SSH_USER@$INSTANCE_IP 'cloud-init status --wait'"

say "next:  ./deploy.sh"
