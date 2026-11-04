#!/bin/sh
# Run the Tally dev build on a phone connected via wireless debugging.
# Finds adb itself, so it works even if the Android SDK isn't on your PATH.
set -e
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$SDK/platform-tools/adb"
[ -x "$ADB" ] || { echo "adb not found at $ADB. Install the Android SDK platform-tools from Android Studio's SDK Manager."; exit 1; }

DEVICES=$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')
if [ -z "$DEVICES" ]; then
  echo "No phone connected. On the phone: Developer options → Wireless debugging → note IP:port, then run:"
  echo "  $ADB connect <ip>:<port>"
  exit 1
fi
for d in $DEVICES; do
  "$ADB" -s "$d" reverse tcp:8081 tcp:8081 >/dev/null && echo "Forwarded port 8081 → $d"
done

# Wireless debugging drops whenever the phone sleeps, and Android clears `adb reverse`
# on every reconnect, which leaves the app stuck on its splash screen. Re-apply it
# every few seconds while the bundler runs so the app recovers by itself.
(
  while true; do
    for d in $("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}'); do
      "$ADB" -s "$d" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
    done
    sleep 3
  done
) &
WATCHER=$!
trap 'kill $WATCHER 2>/dev/null' EXIT INT TERM

[ -d /opt/homebrew/opt/node@22/bin ] && export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
cd "$(dirname "$0")/../apps/mobile"
npx expo start
