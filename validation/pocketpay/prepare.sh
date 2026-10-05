#!/usr/bin/env bash
# Manual validation only. No feature branch mutation or live payment transport.
set -euo pipefail
[[ "$MODE" == camera || "$MODE" == retry ]]
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
controller="$GITHUB_WORKSPACE/controller"
subject="$GITHUB_WORKSPACE/subject"
evidence="$GITHUB_WORKSPACE/evidence/$MODE"
mkdir -p "$evidence"
[[ "$(git -C "$subject" rev-parse HEAD)" == "$SOURCE_SHA" ]]
[[ -z "$(git -C "$subject" status --porcelain)" ]]
git -C "$subject" rev-parse HEAD HEAD^{tree} > "$evidence/executed-source.txt"
git -C "$controller" rev-parse HEAD HEAD^{tree} > "$evidence/controller-source.txt"
uname -a > "$evidence/host.txt"
node --version > "$evidence/node-version.txt"
npm --version > "$evidence/npm-version.txt"
cp "$controller/validation/pocketpay/README.md" "$evidence/SCOPE.md"
(
  cd "$controller/validation/pocketpay/fixtures"
  sha256sum --check ../fixtures.sha256
) > "$evidence/fixture-integrity.txt"
(
  cd "$subject"
  npm ci --legacy-peer-deps --ignore-scripts
) > "$evidence/npm-ci.log" 2>&1
[[ -z "$(git -C "$subject" status --porcelain)" ]]
if [[ "$MODE" == camera ]]; then
  cp "$controller/validation/pocketpay/fixtures/camera-native-fixture.tsx" "$subject/app/(auth)/__camera-native-fixture.tsx"
else
  cp "$controller/validation/pocketpay/fixtures/native321-entry.js" "$controller/validation/pocketpay/fixtures/native321-bootstrap.js" "$subject/"
  cp "$controller/validation/pocketpay/fixtures/native-attempt-route.tsx" "$subject/app/__payment-retry-attempt-native-fixture.tsx"
  python3 - "$subject/package.json" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
data = json.loads(p.read_text())
data["main"] = "native321-entry.js"
p.write_text(json.dumps(data, indent=2) + "\n")
PY
fi
git -C "$subject" status --porcelain > "$evidence/fixture-working-tree.txt"
git -C "$subject" diff --binary > "$evidence/fixture-only-tracked.patch"
curl --fail --location --retry 2 --max-time 180 \
  --output "$GITHUB_WORKSPACE/Expo-Go-54.0.8.apk" \
  https://github.com/expo/expo-go-releases/releases/download/Expo-Go-54.0.8/Expo-Go-54.0.8.apk
printf '%s  %s\n' d72ed2cec15bf029c942d1cb70c933976ec83048e00d130bbfa6bad8cf22331a "$GITHUB_WORKSPACE/Expo-Go-54.0.8.apk" \
  | sha256sum --check > "$evidence/expo-go-integrity.txt"
