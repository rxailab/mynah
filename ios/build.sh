#!/bin/sh
# Builds the app for the simulator and prints only what went wrong.
#
# Xcode lives at /Applications/Xcode.app but xcode-select points at the command
# line tools, so DEVELOPER_DIR is set here rather than asking anyone to run
# `sudo xcode-select -s`.
cd "$(dirname "$0")"
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}

DESTINATION=${DESTINATION:-'platform=iOS Simulator,name=iPhone 16'}
LOG=${LOG:-/tmp/mynah-build.log}

xcodebuild \
  -project Mynah.xcodeproj \
  -scheme Mynah \
  -sdk iphonesimulator \
  -destination "$DESTINATION" \
  -derivedDataPath "${DERIVED_DATA:-/tmp/mynah-dd}" \
  -quiet \
  "${@:-build}" >"$LOG" 2>&1
status=$?

grep -E "error:|warning:" "$LOG" | sed 's|/Volumes/Extreme SSD/smartvoice/ios/||' | sort -u

if [ $status -eq 0 ]; then
  echo "BUILD SUCCEEDED"
else
  echo "BUILD FAILED (full log: $LOG)"
fi
exit $status
