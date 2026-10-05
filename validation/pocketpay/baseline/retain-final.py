"""Retain actual final guest state only after excluding all secret UI."""
import os
from pathlib import Path
import re
import subprocess

root = Path(os.environ['ARTIFACT_DIR'])
secret = re.compile(r'\bS[A-Z2-7]{55}\b')


def adb(*args):
    return subprocess.run(['adb', *args], stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=30, check=True).stdout


try:
    logs = adb('logcat', '-d').decode('utf-8', 'replace')
    (root / 'logcat.txt').write_text(secret.sub('[SECRET_REDACTED]', logs))
except Exception as error:
    (root / 'logcat-capture-error.txt').write_text(type(error).__name__)

remote = '/sdcard/baseline-final-ui.xml'
try:
    adb('shell', 'uiautomator', 'dump', '--compressed', remote)
    xml = adb('exec-out', 'cat', remote).decode('utf-8', 'replace')
    if secret.search(xml) or 'revealed secret key' in xml.casefold():
        (root / 'final-media-excluded.txt').write_text('Secret UI observed; XML and PNG excluded.')
    else:
        data = adb('exec-out', 'screencap', '-p')
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError('ADB did not return a PNG')
        (root / 'final-ui.xml').write_text(xml)
        (root / 'final-screen.png').write_bytes(data)
except Exception as error:
    (root / 'final-media-capture-error.txt').write_text(type(error).__name__)
finally:
    subprocess.run(['adb', 'shell', 'rm', '-f', remote], stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, timeout=15, check=False)
