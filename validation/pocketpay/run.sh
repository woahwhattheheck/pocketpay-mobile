#!/usr/bin/env bash
set -euo pipefail
subject="$GITHUB_WORKSPACE/subject"
evidence="$GITHUB_WORKSPACE/evidence/$MODE"
mkdir -p "$evidence"
export ARTIFACT_DIR="$evidence"
adb version > "$evidence/adb-version.txt"
emulator -version > "$evidence/emulator-version.txt" 2>&1
adb shell getprop > "$evidence/android-properties.txt"
find "$ANDROID_HOME/system-images" -name source.properties -exec cat {} \; > "$evidence/system-image-properties.txt"
adb shell wm size 720x1280
adb shell wm density 320
adb shell input keyevent 82
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb install -r "$GITHUB_WORKSPACE/Expo-Go-54.0.8.apk" > "$evidence/expo-go-install.txt" 2>&1
adb shell dumpsys package host.exp.exponent > "$evidence/expo-go-package.txt"
adb reverse tcp:8081 tcp:8081
(
  cd "$subject"
  npx expo start --go --localhost --port 8081 --max-workers 2
) > "$evidence/metro.log" 2>&1 &
metro_pid=$!
cleanup() {
  set +e
  adb logcat -d > "$evidence/logcat.txt" 2>&1
  adb exec-out screencap -p > "$evidence/final-screen.png"
  adb shell uiautomator dump /sdcard/final-ui.xml >/dev/null 2>&1
  adb pull /sdcard/final-ui.xml "$evidence/final-ui.xml" >/dev/null 2>&1
  git -C "$subject" status --porcelain > "$evidence/final-working-tree.txt"
  git -C "$subject" diff --binary > "$evidence/final-fixture-only.patch"
  kill "$metro_pid" 2>/dev/null
}
trap cleanup EXIT
for attempt in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:8081/status | grep -q 'packager-status:running'; then break; fi
  kill -0 "$metro_pid"
  sleep 2
done
curl --silent --fail http://127.0.0.1:8081/status > "$evidence/metro-status.txt"
python3 "$GITHUB_WORKSPACE/controller/validation/pocketpay/ui.py" "$MODE"
