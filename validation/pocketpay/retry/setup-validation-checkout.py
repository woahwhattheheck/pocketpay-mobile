#!/usr/bin/env python3
"""Prepare an explicitly disposable retry checkout; never dispatch a guest run."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys

if len(sys.argv) != 2:
    raise SystemExit('Usage: setup-validation-checkout.py /path/to/disposable/ddd56649/checkout')
fixture = Path(__file__).resolve().parent
checkout = Path(sys.argv[1]).resolve()
manifest = json.loads((fixture / 'source-manifest.json').read_text())
if subprocess.check_output(['git','rev-parse','HEAD'],cwd=checkout,text=True).strip() != manifest['sourceCommit']:
    raise SystemExit('Expected the exact published retry source commit.')
if subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=checkout,text=True).strip() != manifest['sourceTree']:
    raise SystemExit('Expected the exact published retry source tree.')
if subprocess.check_output(['git','status','--porcelain'],cwd=checkout,text=True).strip():
    raise SystemExit('Use a clean disposable checkout before installing fixtures.')
for relative, expected in manifest['sourceFiles'].items():
    if hashlib.sha256((checkout / relative).read_bytes()).hexdigest() != expected:
        raise SystemExit('Pinned product source mismatch: ' + relative)
for relative, expected in manifest['originalFixtureSha256'].items():
    if hashlib.sha256((fixture / relative).read_bytes()).hexdigest() != expected:
        raise SystemExit('Original fixture bytes changed: ' + relative)
destinations = {
    'native-fixture.tsx': checkout / 'app/send/__retry-gap-native-fixture.tsx',
    'native321-entry.js': checkout / 'native321-entry.js',
    'native321-bootstrap.js': checkout / 'native321-bootstrap.js',
    'retry-gap-observer.js': checkout / 'retry-gap-observer.js',
    'retry-gap-launch-route.tsx': checkout / 'app/__retry-gap-observer-native-fixture.tsx',
}
if any(path.exists() for path in destinations.values()):
    raise SystemExit('Refusing to overwrite fixture files.')
package_path = checkout / 'package.json'
original = package_path.read_bytes()
package = json.loads(original)
if package.get('main') != 'expo-router/entry':
    raise SystemExit('The product checkout must retain its normal router entry before setup.')
backup = checkout / 'retry-gap-package.original.json'
if backup.exists():
    raise SystemExit('Refusing to overwrite the fixture package backup.')
backup.write_bytes(original)
for name, destination in destinations.items():
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(fixture / 'fixtures' / name, destination)
package['main'] = './native321-entry.js'
package_path.write_text(json.dumps(package,indent=2)+'\n')
print(json.dumps({'sourceCommit':manifest['sourceCommit'],'sourceTree':manifest['sourceTree'],
    'temporaryEntry':package['main'],'startRoute':'/__retry-gap-observer-native-fixture?outcome=nohash|empty|mismatch',
    'actualGapRoute':'/send/__retry-gap-native-fixture','productSourceFilesChanged':False,
    'onlyTrackedChange':'package.json main for validation entry','nativeExecution':False},indent=2))
