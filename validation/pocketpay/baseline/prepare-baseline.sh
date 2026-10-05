#!/usr/bin/env bash
# Local proposal for one later coordinated manual Android job. Never product.
set -euo pipefail
controller="${BASELINE_CONTROLLER_DIR:-$GITHUB_WORKSPACE/controller/validation/pocketpay/baseline}"
subject="$GITHUB_WORKSPACE/subject"
evidence="$GITHUB_WORKSPACE/evidence/baseline"
mkdir -p "$evidence"
[[ "$SOURCE_SHA" == 52ce8006a2d091a4c9f29852a1a530750ff9b3cc ]]
[[ "$(git -C "$subject" rev-parse HEAD)" == "$SOURCE_SHA" ]]
[[ "$(git -C "$subject" rev-parse HEAD^{tree})" == b7556026e93c5930915d12fdf51d421773c5f61e ]]
[[ -z "$(git -C "$subject" status --porcelain)" ]]
git -C "$subject" rev-parse HEAD HEAD^{tree} > "$evidence/executed-source.txt"
git -C "$GITHUB_WORKSPACE/controller" rev-parse HEAD HEAD^{tree} > "$evidence/controller-source.txt"
node --version > "$evidence/node-version.txt"
npm --version > "$evidence/npm-version.txt"
cp "$controller/README.md" "$evidence/SCOPE.md"
python3 - "$controller" <<'PY' > "$evidence/fixture-integrity.txt"
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
pins = {'baseline-fixture': 'eb0c5d6364b07b6a6b983488bea2a018ed6305880ac99f7ab6f0934726a10092',
        'vault-fixture': '5f1ce139bc2e72c3077a90093edaef640adbfa1f0b39a37f050c77ddda7f7ebc'}
for directory, expected in pins.items():
    base = root / directory
    manifest = base / 'fixture-manifest.json'
    if hashlib.sha256(manifest.read_bytes()).hexdigest() != expected:
        raise SystemExit('Immutable fixture manifest mismatch: ' + directory)
    data = json.loads(manifest.read_text())
    if data['sourceCommit'] != '52ce8006a2d091a4c9f29852a1a530750ff9b3cc':
        raise SystemExit('Fixture source mismatch')
    for name, digest in data.get('fixtureFilesSha256', data.get('files')).items():
        if hashlib.sha256((base / name).read_bytes()).hexdigest() != digest:
            raise SystemExit('Fixture file mismatch: ' + name)
    print(directory + ': all immutable hashes verified')
PY
(
  cd "$subject"
  npm ci --legacy-peer-deps --ignore-scripts
) > "$evidence/npm-ci.log" 2>&1
[[ -z "$(git -C "$subject" status --porcelain)" ]]
python3 "$controller/baseline-fixture/setup-validation-checkout.py" "$subject" > "$evidence/fixture-setup.json"
python3 - "$controller" "$subject" <<'PY' > "$evidence/vault-route-setup.json"
import hashlib, json, pathlib, shutil, sys
controller, subject = map(pathlib.Path, sys.argv[1:])
manifest = json.loads((controller / 'vault-fixture/source-manifest.json').read_text())
for name, expected in manifest['sourceFiles'].items():
    if hashlib.sha256((subject / name).read_bytes()).hexdigest() != expected:
        raise SystemExit('Vault production file changed: ' + name)
guard = subject / 'native-vault-bootstrap.js'
if hashlib.sha256(guard.read_bytes()).hexdigest() != '906ef0b16031f8df4f28e1f484e856a2c8f621417cb3a44b1cbc991fede11548':
    raise SystemExit('Shared vault transport guard changed')
route = subject / 'app/__vault-native-fixture.tsx'
if route.exists():
    raise SystemExit('Refusing to overwrite an existing route')
shutil.copyfile(controller / 'vault-fixture/native-vault-route.tsx', route)
print(json.dumps({'sharedGuardVerified': True, 'route': str(route), 'source': manifest['sourceCommit']}))
PY
git -C "$subject" status --porcelain > "$evidence/fixture-working-tree.txt"
git -C "$subject" diff --binary > "$evidence/fixture-only-tracked.patch"
curl --fail --location --retry 2 --max-time 180 \
  --output "$GITHUB_WORKSPACE/Expo-Go-54.0.8.apk" \
  https://github.com/expo/expo-go-releases/releases/download/Expo-Go-54.0.8/Expo-Go-54.0.8.apk
printf '%s  %s\n' d72ed2cec15bf029c942d1cb70c933976ec83048e00d130bbfa6bad8cf22331a "$GITHUB_WORKSPACE/Expo-Go-54.0.8.apk" \
  | sha256sum --check > "$evidence/expo-go-integrity.txt"
