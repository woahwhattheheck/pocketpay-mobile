#!/usr/bin/env bash
set -euo pipefail
controller="$GITHUB_WORKSPACE/controller/validation/pocketpay"
if [[ "$MODE" == baseline ]]; then
  exec bash "$controller/baseline/run-baseline.sh"
fi
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
  if [[ "$MODE" == camera && ( "${primary_exit:-}" == 2 || "${contacts_exit:-}" == 2 ) ]]; then
    printf '%s\n' '{"mediaExcluded":true,"guestCommandsPerformed":false,"reason":"Unsafe camera/Send result: no final guest logs, UI dump or screenshot collected"}' \
      > "$evidence/cleanup-media-excluded.json"
  else
    python3 "$controller/baseline/retain-final.py"
  fi
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
if [[ "$MODE" == camera ]]; then
  serial="$(adb get-serialno)"
  [[ -n "$serial" && "$serial" != unknown ]]
  # Reset only this disposable runner guest's Expo Go data, never an owner device.
  adb -s "$serial" shell am force-stop host.exp.exponent
  adb -s "$serial" shell pm clear host.exp.exponent > "$evidence/camera-fresh-profile.txt"
  [[ "$(tr -d '\r' < "$evidence/camera-fresh-profile.txt")" == Success ]]
  adb -s "$serial" reverse tcp:8081 tcp:8081
  if python3 "$controller/camera-recording-runner.py" --serial "$serial" \
    --source-checkout "$subject" --artifacts "$evidence/camera-primary" \
    --suite primary-and-user-fixed --fresh-data-receipt "$evidence/camera-fresh-profile.txt"; then
    primary_exit=0
  else primary_exit=$?; fi
  if [[ "$primary_exit" == 2 ]]; then
    # An unsafe Send prerequisite/media/custody condition blocks remaining guest
    # cases; even a reset is not permission to continue after that safety stop.
    contacts_exit=2
    mkdir -p "$evidence/contacts-first-denial"
    printf '%s\n' '{"result":"blocked_unattempted","passed":false,"nativeExecution":false,"reason":"Unsafe primary/Send condition; no reset, launch or permission action performed"}' \
      > "$evidence/contacts-first-denial/observations.json"
  else
    # Contacts first-denial is independent and needs a genuinely fresh asked cache.
    adb -s "$serial" shell am force-stop host.exp.exponent
    adb -s "$serial" shell pm clear host.exp.exponent > "$evidence/contacts-fresh-profile.txt"
    [[ "$(tr -d '\r' < "$evidence/contacts-fresh-profile.txt")" == Success ]]
    adb -s "$serial" reverse tcp:8081 tcp:8081
    if python3 "$controller/camera-recording-runner.py" --serial "$serial" \
      --source-checkout "$subject" --artifacts "$evidence/contacts-first-denial" \
      --suite contacts-first-denial --fresh-data-receipt "$evidence/contacts-fresh-profile.txt"; then
      contacts_exit=0
    else contacts_exit=$?; fi
  fi
  python3 - "$evidence" "$primary_exit" "$contacts_exit" <<'PY2'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]);data={'mode':'camera','primaryExit':int(sys.argv[2]),'contactsFirstDenialExit':int(sys.argv[3]),'cameraMocked':False}
for kind,name in [('primary','camera-primary/observations.json'),('contactsFirstDenial','contacts-first-denial/observations.json')]:
 p=root/name;data[kind]=json.loads(p.read_text()) if p.exists() else {'result':'failed: no report produced'}
data['sendPreservation']=data['primary'].get('sendPreservation',{'status':'not_attempted','passed':False})
(root/'observations.json').write_text(json.dumps(data,indent=2)+'\n')
PY2
  [[ "$primary_exit" == 0 && "$contacts_exit" == 0 ]]
else
  if python3 "$controller/retry-primary-ui.py" retry; then primary_exit=0; else primary_exit=$?; fi
  adb logcat -d | python3 -c 'import re,sys; print(re.sub(r"\bS[A-Z2-7]{55}\b", "[SECRET_REDACTED]",sys.stdin.read()))' > "$evidence/primary-logcat.txt"
  if python3 "$controller/retry-gap-runner.py"; then gap_exit=0; else gap_exit=$?; fi
  python3 - "$evidence" "$primary_exit" "$gap_exit" <<'PY2'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]);data={'mode':'retry','primaryExit':int(sys.argv[2]),'gapExit':int(sys.argv[3]),'liveBroadcast':False}
for kind,name in [('primary','retry-primary-observations.json'),('gaps','retry-gap-observations.json')]:
 p=root/name;data[kind]=json.loads(p.read_text()) if p.exists() else {'result':'failed: no report produced'}
(root/'observations.json').write_text(json.dumps(data,indent=2)+'\n')
PY2
  [[ "$primary_exit" == 0 && "$gap_exit" == 0 ]]
fi
git -C "$subject" diff --exit-code -- . ':!package.json' > "$evidence/final-production-files-unchanged.txt"
