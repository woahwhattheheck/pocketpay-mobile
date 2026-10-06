"""Capture real guest observations. Importing defines helpers; it never operates ADB."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = Path(os.environ['ARTIFACT_DIR'])
PACKAGE = 'host.exp.exponent'

class UnsafeEnvironment(RuntimeError):
    """Do not perform further guest interactions after this condition."""

def adb(*args, binary=False, timeout=25, check=True):
    result = subprocess.run(['adb', *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, check=check)
    return result.stdout if binary else result.stdout.decode('utf-8', 'replace')

def dump(name=None):
    remote = '/sdcard/pocketpay-retry-gap-ui.xml'
    try:
        adb('shell', 'uiautomator', 'dump', '--compressed', remote, timeout=20)
        xml = adb('exec-out', 'cat', remote)
    finally:
        adb('shell', 'rm', '-f', remote, check=False)
    if 'revealed secret key' in xml.casefold() or re.search(r'\bS[A-Z2-7]{55}\b', xml):
        raise UnsafeEnvironment('Unsafe secret UI; no XML or PNG is retained.')
    tree = ET.fromstring(xml)
    if name:
        (ROOT / (name + '.xml')).write_text(xml)
    return tree

def labels(tree):
    return [(node.attrib.get('text', '') + ' ' + node.attrib.get('content-desc', '')).strip()
            for node in tree.iter('node')]

def contains(tree, label):
    return any(label.casefold() in text.casefold() for text in labels(tree))

def developer_sheet(tree):
    return contains(tree, 'SDK') and contains(tree, 'Connected to expo-cli')

def require_uncovered(tree):
    if developer_sheet(tree):
        raise RuntimeError('Observed Expo developer sheet covers the product UI.')

def capture(name, required_label=None):
    before = dump(name)
    require_uncovered(before)
    if required_label and not contains(before, required_label):
        return None
    data = adb('exec-out', 'screencap', '-p', binary=True)
    # Check another real hierarchy before persisting the in-memory PNG.
    after = dump(name + '-post-media-guard')
    require_uncovered(after)
    if required_label and not contains(after, required_label):
        return None
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise RuntimeError('ADB did not return an actual PNG.')
    (ROOT / (name + '.png')).write_bytes(data)
    return before

def bounds(node):
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.attrib.get('bounds', ''))
    if not match:
        return None
    box = tuple(map(int, match.groups()))
    return box if 0 <= box[0] < box[2] <= 720 and 0 <= box[1] < box[3] <= 1280 else None

def exact_action(tree, label):
    parents = {child: parent for parent in tree.iter() for child in parent}
    matches = {}
    for node in tree.iter('node'):
        if not any(node.attrib.get(key, '').casefold() == label.casefold()
                   for key in ('text', 'content-desc')):
            continue
        action = None
        cursor = node
        disabled = False
        while cursor is not None:
            if cursor.attrib.get('enabled') == 'false':
                disabled = True
                break
            if action is None and cursor.attrib.get('clickable') == 'true':
                action = cursor
            cursor = parents.get(cursor)
        if not disabled and action is not None and action.attrib.get('enabled') == 'true' and bounds(action):
            matches[bounds(action)] = action
    if len(matches) > 1:
        raise RuntimeError('Ambiguous native action bounds: ' + label)
    return next(iter(matches.values())) if matches else None

def tap(label, scroll=False):
    for attempt in range(6 if scroll else 1):
        tree = dump()
        require_uncovered(tree)
        node = exact_action(tree, label)
        if node is not None:
            x1, y1, x2, y2 = bounds(node)
            adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
            return
        if scroll:
            adb('shell', 'input', 'swipe', '360', '1080', '360', '330', '350')
    raise RuntimeError('No observed enabled exact native action: ' + label)

def wait(label, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        tree = dump()
        # Dismiss only the observed Expo developer sheet, using native Back.
        if developer_sheet(tree):
            name = 'observed-expo-developer-sheet-' + str(time.time_ns())
            (ROOT / (name + '.xml')).write_text(ET.tostring(tree, encoding='unicode'))
            (ROOT / (name + '.json')).write_text(json.dumps({'observedLabels': labels(tree),
                'action': 'native BACK after actual SDK and Connected-to-expo-cli labels'}, indent=2))
            adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
            continue
        if contains(tree, label):
            return tree
        time.sleep(0.3)
    capture('unmatched-state')
    raise RuntimeError('Expected actual UI did not appear: ' + label)

def launch(outcome):
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('logcat', '-c')
    url = 'exp://127.0.0.1:8081/--/__retry-gap-observer-native-fixture?outcome=' + outcome
    result = adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
                 '-d', shlex.quote(url), '-p', PACKAGE)
    with (ROOT / 'launches.txt').open('a') as stream:
        stream.write(result + '\n')

def native_records():
    prefix = 'POCKETPAY_RETRY_GAP_NATIVE_OBSERVER'
    records = []
    for line in adb('logcat', '-d', '-s', 'ReactNativeJS:I').splitlines():
        if prefix not in line:
            continue
        try:
            records.append(json.JSONDecoder().raw_decode(line.split(prefix, 1)[1].lstrip(' :'))[0])
        except ValueError:
            continue
    if not records:
        raise RuntimeError('No actual native observer records were captured.')
    return records

def snapshot(name, outcome):
    records = native_records()
    serialized = json.dumps(records, indent=2)
    serialized = re.sub(r'\bS[A-Z2-7]{55}\b', '[SECRET_REDACTED]', serialized)
    (ROOT / (name + '-observer-records.json')).write_text(serialized)
    for record in records:
        if record.get('sourceSha') != 'ddd56649099d1fc5763ef29af3bfba0363897bd6' or record.get('outcome') != outcome:
            raise UnsafeEnvironment('Native observer provenance does not match the case.')
        for key in ('secretCalls', 'signingCalls', 'submitCalls', 'rpcWrites',
                    'broadcastAttempts', 'walletSaveAttempts'):
            if record.get('counters', {}).get(key) != 0:
                raise UnsafeEnvironment('Unexpected actual native safety guard counter: ' + key)
        if record.get('counters', {}).get('unknownClears') != 0:
            raise RuntimeError('The uncertain payment was unexpectedly cleared.')
    return records[-1]
