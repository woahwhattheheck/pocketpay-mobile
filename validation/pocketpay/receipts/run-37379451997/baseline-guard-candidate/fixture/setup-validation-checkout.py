#!/usr/bin/env python3
"""Install the baseline fixture only in an explicitly disposable native checkout."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

if len(sys.argv) != 2:
    raise SystemExit('Usage: python3 setup-validation-checkout.py /path/to/disposable/native/checkout')
fixture = Path(__file__).resolve().parent
checkout = Path(sys.argv[1]).resolve()
manifest = json.loads((fixture / 'source-manifest.json').read_text())
for relative, expected in manifest['sourceFiles'].items():
    source = checkout / relative
    if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != expected:
        raise SystemExit('Source mismatch; fixture was prepared for baseline 52ce8006: ' + relative)
package_path = checkout / 'package.json'
original = package_path.read_bytes()
package = json.loads(original)
if package.get('main') != 'expo-router/entry':
    raise SystemExit('Checkout must use its normal expo-router/entry before fixture installation.')
destinations = {
    'native-baseline-entry.js': checkout / 'native-baseline-entry.js',
    'native-baseline-stellar-guard.js': checkout / 'native-baseline-stellar-guard.js',
    'native-vault-bootstrap.js': checkout / 'native-vault-bootstrap.js',
    'native-baseline-bootstrap.js': checkout / 'native-baseline-bootstrap.js',
    'native-baseline-cases.tsx': checkout / 'native-baseline-cases.tsx',
    'native-baseline-observation-cases.tsx': checkout / 'native-baseline-observation-cases.tsx',
    'native-baseline-route.tsx': checkout / 'app/send/__baseline-native-fixture.tsx',
}
for path in destinations.values():
    if path.exists():
        raise SystemExit('Refusing to overwrite an existing fixture file: ' + str(path))
backup = checkout / 'native-baseline-package.original.json'
if backup.exists():
    raise SystemExit('Refusing to overwrite an existing fixture package backup.')
backup.write_bytes(original)
for name, destination in destinations.items():
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(fixture / name, destination)
package['main'] = './native-baseline-entry.js'
package_path.write_text(json.dumps(package, indent=2) + '\n')
print(json.dumps({
    'checkout': str(checkout), 'fixtureEntry': package['main'],
    'route': '/send/__baseline-native-fixture',
    'productionFilesVerified': len(manifest['sourceFiles']),
    'warning': 'Validation only. Dedicated manual validation controller branches may retain these files. Restore the package backup and remove fixture files before any product/prerequisite/feature branch or product distribution.'
}, indent=2))
