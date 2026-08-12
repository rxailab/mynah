#!/bin/sh
# Builds, installs and runs the app on the connected iPhone with its console
# attached — print(), os_log and a crash's backtrace all come back here.
#
# What this is not: a debugger. Breakpoints and lldb need an Xcode that knows
# the device's iOS version, and this Mac has Xcode 16.2 against a phone on iOS
# 26.5. `xcodebuild -destination id=...` refuses that pairing outright, which is
# why the build below targets a generic device and devicectl does the installing.
# Install, launch and console all work across that gap; stepping through code
# does not. Install Xcode 26 if you need breakpoints.
#
#   ios/run-device.sh              build, install, run with the console attached
#   ios/run-device.sh --no-build   just relaunch what is already on the phone
set -e
cd "$(dirname "$0")"
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}

TEAM=${DEVELOPMENT_TEAM:-G4ACJ84PFL}
BUNDLE=com.voicecall.mynah
DERIVED=${DERIVED_DATA:-/tmp/mynah-dd}

# The first paired iPhone. Set DEVICE to pin it when more than one is plugged in.
DEVICE=${DEVICE:-$(xcrun devicectl list devices --quiet --json-output /dev/stdout 2>/dev/null |
  python3 -c "
import json, sys
devices = json.load(sys.stdin)['result']['devices']
usable = [d for d in devices
          if d['connectionProperties']['tunnelState'] != 'unavailable'
          and 'iPhone' in d['hardwareProperties']['deviceType']]
print(usable[0]['identifier'] if usable else '')
")}

if [ -z "$DEVICE" ]; then
  echo "No paired iPhone found. Plug it in and unlock it; if it has never been"
  echo "paired with this Mac, run:"
  echo "  xcrun devicectl manage pair --device <name>"
  exit 1
fi

if [ "$1" != "--no-build" ]; then
  echo "==> building"
  xcodebuild -project Mynah.xcodeproj -scheme Mynah \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$DERIVED" \
    -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" \
    -quiet build

  echo "==> installing"
  xcrun devicectl device install app --device "$DEVICE" \
    "$DERIVED/Build/Products/Debug-iphoneos/Mynah.app" >/dev/null
fi

# Ctrl-C stops the app as well as the console: devicectl holds the process
# while it is attached. Launch it from the home screen instead when you want
# it to outlive the terminal.
echo "==> running (ctrl-c stops the app too)"
exec xcrun devicectl device process launch \
  --device "$DEVICE" --terminate-existing --console "$BUNDLE"
