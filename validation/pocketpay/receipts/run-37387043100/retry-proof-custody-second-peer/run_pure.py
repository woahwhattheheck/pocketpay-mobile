"""Run frozen owner and peer cases with an external-process denial boundary."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
SUBJECT=ROOT/'pocketpay-retry-proof-custody-local-candidate-v2'
BASE=ROOT/'pocketpay-remote-native-controller-intro-composed-proposal/validation/pocketpay'
temporary=tempfile.TemporaryDirectory(prefix='retry-custody-peer-pure-')
os.environ['ARTIFACT_DIR']=temporary.name
os.environ['SOURCE_SHA']='ddd56649099d1fc5763ef29af3bfba0363897bd6'
counts={name:0 for name in ('run','Popen','check_output','check_call','call')}
def guard(name):
    def deny(*args,**kwargs):
        counts[name]+=1
        raise AssertionError('Unmocked external subprocess forbidden: '+name)
    return deny
guards={name:guard(name) for name in counts}
for name,deny in guards.items():setattr(subprocess,name,deny)
for p in (BASE,BASE/'camera',BASE/'retry',SUBJECT,HERE):sys.path.insert(0,str(p))
loader=unittest.TestLoader()
owner=loader.discover(str(SUBJECT),pattern='test_retry_*.py')
from peer_checks import PeerChecks
suite=unittest.TestSuite([owner,loader.loadTestsFromTestCase(PeerChecks)])
# Frozen owner module also denies run/Popen on import. Reinstall the counted
# boundary before execution so every unmocked path is independently counted.
for name,deny in guards.items():setattr(subprocess,name,deny)
result=unittest.TextTestRunner(verbosity=2).run(suite)
receipt={'installedBeforeSubjectImport':True,'unmockedAttemptCounts':counts,
    'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),
    'nativeAdbExecuted':False}
(HERE/'subprocess-guard.json').write_text(json.dumps(receipt,indent=2)+'\n')
temporary.cleanup()
sys.exit(0 if result.wasSuccessful() and not any(counts.values()) else 1)
