"""Deny every unmocked subprocess boundary while running both pure suites."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SUBJECT = HERE.parent/'pocketpay-retry-deadline-local-candidate'
temporary = tempfile.TemporaryDirectory(prefix='retry-peer-pure-')
os.environ['ARTIFACT_DIR'] = temporary.name
os.environ['SOURCE_SHA'] = 'ddd56649099d1fc5763ef29af3bfba0363897bd6'
counts = {name: 0 for name in ('run', 'Popen', 'check_output', 'check_call', 'call')}
def deny(name):
    def blocked(*args, **kwargs):
        counts[name] += 1
        raise AssertionError('Pure peer denied an unmocked subprocess boundary: '+name)
    return blocked
for name in counts:
    setattr(subprocess, name, deny(name))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(SUBJECT))
suite = unittest.TestSuite()
suite.addTests(unittest.defaultTestLoader.discover(str(SUBJECT), pattern='test_retry_*.py'))
suite.addTests(unittest.defaultTestLoader.loadTestsFromName('peer_checks'))
result = unittest.TextTestRunner(verbosity=2).run(suite)
(HERE/'subprocess-guard.json').write_text(json.dumps({
    'installedBeforeSubjectImport': True, 'unmockedAttemptCounts': counts,
    'tests': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
    'nativeAdbExecuted': False,
}, indent=2)+'\n')
sys.exit(0 if result.wasSuccessful() and not any(counts.values()) else 1)
