#!/usr/bin/env python3
"""Install a temporary entry/route into an explicitly disposable native checkout."""
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
    path = checkout / relative
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit('Source mismatch; fixture was prepared for baseline 52ce8006: ' + relative)
package_path = checkout / 'package.json'
original = package_path.read_bytes()
package = json.loads(original)
if package.get('main') != 'expo-router/entry':
    raise SystemExit('Checkout must use its normal expo-router/entry before fixture installation.')
destinations = {
    'native-vault-entry.js': checkout / 'native-vault-entry.js',
    'native-vault-bootstrap.js': checkout / 'native-vault-bootstrap.js',
    'native-vault-route.tsx': checkout / 'app/__vault-native-fixture.tsx',
}
for path in destinations.values():
    if path.exists():
        raise SystemExit('Refusing to overwrite an existing fixture file: ' + str(path))
backup_path = checkout / 'native-vault-package.original.json'
if backup_path.exists():
    raise SystemExit('Refusing to overwrite an existing fixture package backup.')
backup_path.write_bytes(original)
for name, path in destinations.items():
    shutil.copyfile(fixture / name, path)
package['main'] = './native-vault-entry.js'
package_path.write_text(json.dumps(package, indent=2) + '\n')
print(json.dumps({
    'checkout': str(checkout), 'fixtureEntry': package['main'],
    'route': '/__vault-native-fixture', 'productionFilesVerified': len(manifest['sourceFiles']),
    'warning': 'Validation only. Restore package backup and remove all four fixture files before any product commit; dedicated validation controller branches may retain them.'
}, indent=2))
