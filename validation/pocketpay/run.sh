#!/usr/bin/env bash
set -euo pipefail
# The emulator action invokes tools by absolute SDK paths without extending PATH.
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
subject="$GITHUB_WORKSPACE/subject"
evidence="$GITHUB_WORKSPACE/evidence/$MODE"
mkdir -p "$evidence"
export ARTIFACT_DIR="$evidence"
metro_pid=""
cleanup() {
  hook_exit=$?
  set +e
  printf '%s\n' "$hook_exit" > "$evidence/controller-exit-code.txt"
  adb logcat -d > "$evidence/logcat.txt" 2>&1
  adb exec-out screencap -p > "$evidence/final-screen.png"
  adb shell uiautomator dump /sdcard/final-ui.xml >/dev/null 2>&1
  adb pull /sdcard/final-ui.xml "$evidence/final-ui.xml" >/dev/null 2>&1
  git -C "$subject" status --porcelain > "$evidence/final-working-tree.txt"
  git -C "$subject" diff --binary > "$evidence/final-fixture-only.patch"
  if [[ -n "$metro_pid" ]]; then kill "$metro_pid" 2>/dev/null; fi
}
trap cleanup EXIT
adb version > "$evidence/adb-version.txt"
printf 'locator=%s\n' "$ANDROID_HOME/emulator/emulator" > "$evidence/emulator-version-status.txt"
# Version collection is optional metadata. Actual headless boot and Android
# build properties are independently retained; a GUI-library failure cannot
# prevent installing the app or weaken the critical ADB/UI checks below.
if "$ANDROID_HOME/emulator/emulator" -no-window -noaudio -version > "$evidence/emulator-version.txt" 2>&1; then
  printf 'exit=0\n' >> "$evidence/emulator-version-status.txt"
else
  printf 'exit=%s\n' "$?" >> "$evidence/emulator-version-status.txt"
fi
adb shell getprop > "$evidence/android-properties.txt"
[[ "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" == 34 ]]
if find "$ANDROID_HOME/system-images" -name source.properties -exec cat {} \; > "$evidence/system-image-properties.txt" 2>&1; then
  printf 'exit=0\n' > "$evidence/system-image-properties-status.txt"
else
  printf 'exit=%s\n' "$?" > "$evidence/system-image-properties-status.txt"
fi
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
for attempt in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:8081/status | grep -q 'packager-status:running'; then break; fi
  kill -0 "$metro_pid"
  sleep 2
done
curl --silent --fail http://127.0.0.1:8081/status > "$evidence/metro-status.txt"
python3 "$GITHUB_WORKSPACE/controller/validation/pocketpay/ui.py" "$MODE"
