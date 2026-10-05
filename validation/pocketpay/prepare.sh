#!/usr/bin/env bash
# Manual isolated validation only. Product refs/production files remain untouched.
set -euo pipefail
[[ "$MODE" == camera || "$MODE" == retry || "$MODE" == baseline ]]
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
controller="$GITHUB_WORKSPACE/controller/validation/pocketpay"
subject="$GITHUB_WORKSPACE/subject"
evidence="$GITHUB_WORKSPACE/evidence/$MODE"
mkdir -p "$evidence"
python3 - "$GITHUB_WORKSPACE/controller" <<'PY' > "$evidence/controller-integrity.txt"
import hashlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1]);data=json.loads((root/'validation/pocketpay/controller-manifest.json').read_text())
for name,digest in data['filesSha256'].items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:
  raise SystemExit('Controller file hash mismatch: '+name)
print('All reviewed controller file hashes match')
PY
if [[ "$MODE" == baseline ]]; then
  exec bash "$controller/baseline/prepare-baseline.sh"
fi
[[ "$(git -C "$subject" rev-parse HEAD)" == "$SOURCE_SHA" ]]
[[ -z "$(git -C "$subject" status --porcelain)" ]]
git -C "$subject" rev-parse HEAD HEAD^{tree} > "$evidence/executed-source.txt"
git -C "$GITHUB_WORKSPACE/controller" rev-parse HEAD HEAD^{tree} > "$evidence/controller-source.txt"
uname -a > "$evidence/host.txt"
node --version > "$evidence/node-version.txt"
npm --version > "$evidence/npm-version.txt"
cp "$controller/README.md" "$evidence/SCOPE.md"
(
  cd "$subject"
  npm ci --legacy-peer-deps --ignore-scripts
) > "$evidence/npm-ci.log" 2>&1
[[ -z "$(git -C "$subject" status --porcelain)" ]]
if [[ "$MODE" == camera ]]; then
  python3 "$controller/camera/verify_checkout.py" "$subject" > "$evidence/source-integrity.json"
  mkdir -p "$subject/app/send"
  cp "$controller/camera/fixtures/camera-native-fixture.tsx" "$subject/app/send/__camera-native-fixture.tsx"
  python3 - "$controller/camera" "$subject" <<'PY' > "$evidence/fixture-integrity.json"
import pathlib,sys,json
sys.path.insert(0,sys.argv[1]);from verify_checkout import verify
print(json.dumps(verify(pathlib.Path(sys.argv[2]),require_installed=True),indent=2))
PY
else
  # This setup verifies exact ddd commit/tree + all pinned production/fixture bytes.
  python3 "$controller/retry/setup-validation-checkout.py" "$subject" > "$evidence/gap-fixture-setup.json"
  python3 - "$controller" "$subject" <<'PY' > "$evidence/primary-fixture-integrity.json"
import hashlib,json,pathlib,shutil,sys
controller,subject=map(pathlib.Path,sys.argv[1:]);base=controller/'retry-primary'
manifest=json.loads((base/'fixture-manifest.json').read_text())
for name,digest in manifest['fixtureFilesSha256'].items():
 if hashlib.sha256((base/name).read_bytes()).hexdigest()!=digest:
  raise SystemExit('Primary fixture mismatch: '+name)
for name,digest in manifest['sourceFilesSha256'].items():
 if hashlib.sha256((subject/name).read_bytes()).hexdigest()!=digest:
  raise SystemExit('Primary production source mismatch: '+name)
for name in ('native321-entry.js','native321-bootstrap.js'):
 if (subject/name).read_bytes()!=(base/name).read_bytes():
  raise SystemExit('Original shared entry/bootstrap bytes differ')
destinations={base/'native-attempt-route.tsx':subject/'app/__payment-retry-attempt-native-fixture.tsx',
 controller/'primary-observer.js':subject/'primary-observer.js',
 controller/'primary-validation-entry.js':subject/'primary-validation-entry.js'}
for src,dst in destinations.items():
 if dst.exists():raise SystemExit('Refuse to overwrite validation route: '+str(dst))
 shutil.copyfile(src,dst)
p=subject/'package.json';data=json.loads(p.read_text());data['main']='./primary-validation-entry.js';p.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'sourceCommit':manifest['sourceCommit'],'sourceTree':manifest['sourceTree'],
 'originalEntryBootstrapUnchanged':True,'temporaryEntry':data['main'],'productionScreensChanged':False},indent=2))
PY
fi
# The only permitted tracked edit is the explicitly temporary retry package entry.
git -C "$subject" diff --exit-code -- . ':!package.json' > "$evidence/production-files-unchanged.txt"
if [[ "$MODE" == camera ]]; then git -C "$subject" diff --exit-code -- package.json >> "$evidence/production-files-unchanged.txt"; fi
git -C "$subject" status --porcelain > "$evidence/fixture-working-tree.txt"
git -C "$subject" diff --binary > "$evidence/fixture-only-tracked.patch"
curl --fail --location --retry 2 --max-time 180 \
  --output "$GITHUB_WORKSPACE/Expo-Go-54.0.8.apk" \
  https://github.com/expo/expo-go-releases/releases/download/Expo-Go-54.0.8/Expo-Go-54.0.8.apk
printf '%s  %s\n' d72ed2cec15bf029c942d1cb70c933976ec83048e00d130bbfa6bad8cf22331a "$GITHUB_WORKSPACE/Expo-Go-54.0.8.apk" \
  | sha256sum --check > "$evidence/expo-go-integrity.txt"
