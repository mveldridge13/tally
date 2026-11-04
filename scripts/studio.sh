#!/bin/sh
# Opens the Android project in Android Studio with this shell's PATH, so Gradle can find `node`.
# (Apps launched from the Dock don't inherit your terminal PATH, which breaks Gradle sync.)
set -e
cd "$(dirname "$0")/../apps/mobile"
[ -d android ] || npx expo prebuild --platform android
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
nohup "/Applications/Android Studio.app/Contents/MacOS/studio" "$PWD/android" >/dev/null 2>&1 &
echo "Opening apps/mobile/android in Android Studio…"
