"""Pure original-log/overlay checks. No ADB, guest or native-execution claims."""
import ast
import copy
import json
import pathlib
import tempfile
import unittest
import xml.etree.ElementTree as ET
from baseline_observer_framing import decode_observer_line, BASELINE_PREFIX, VAULT_PREFIX
from baseline_startup_overlay import FatalFixtureStartup, fixture_startup_error

HERE = pathlib.Path(__file__).parent
RECEIPTS = HERE.parent / 'receipts/run-37379451997/baseline'


def helper_namespace(root):
    tree = ast.parse((HERE / 'ui_helpers.py').read_text())
    keep = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.FunctionDef))]
    ns = {'ROOT': root, 'REPORT': {'cases': [], 'optional_observations': []}}
    exec(compile(ast.Module(body=keep, type_ignores=[]), '<actual-helper-definitions>', 'exec'), ns)
    return ns


class BaselineObservationChecks(unittest.TestCase):
    def setUp(self):
        self.actual = ET.fromstring((RECEIPTS/'observed-runtime-not-ready.xml').read_text())

    def test_original_quoted_vault_line_old_rejects_new_decodes_whole_zero_seed(self):
        line = (RECEIPTS/'observed-vault-logcat-line.txt').read_text().strip()
        with self.assertRaises(json.JSONDecodeError):
            json.JSONDecoder().raw_decode(line.split(VAULT_PREFIX,1)[1].lstrip(' :'))
        state = decode_observer_line(line, VAULT_PREFIX)
        self.assertIsInstance(state,dict)
        self.assertEqual(state['event'],'bootstrap-ready')
        for key in ('addLock','deposit','withdraw','secretAccess','broadcastAttempts','persistedLocks'):
            self.assertEqual(state[key],0)
        self.assertIsNone(state['lastLock'])
        # These actual zero-init records cannot satisfy the unchanged real lock gate.
        self.assertFalse(state['addLock']==1 and state['persistedLocks']==1)

    def test_source_derived_baseline_prefix_and_negative_frames(self):
        state={'phase':'ready','source':'dummy source-derived parser case'}
        payload=json.dumps(state)
        for line in (BASELINE_PREFIX+' '+payload, "'"+BASELINE_PREFIX+"', '"+payload+"'", ' INFO '+BASELINE_PREFIX+' '+payload):
            self.assertEqual(decode_observer_line(line,BASELINE_PREFIX),state)
        for line,prefix in ((BASELINE_PREFIX+' '+payload+' trailing',BASELINE_PREFIX),
                            ('WRONG '+payload,BASELINE_PREFIX),
                            ("W ReactNativeJS: "+BASELINE_PREFIX+' '+payload,BASELINE_PREFIX),
                            (BASELINE_PREFIX+' {"x":1,"x":2}',BASELINE_PREFIX),
                            (BASELINE_PREFIX+' {"x":NaN}',BASELINE_PREFIX),
                            ('POCKETPAY_RETRY_PRIMARY_NATIVE_OBSERVER '+payload,'POCKETPAY_RETRY_PRIMARY_NATIVE_OBSERVER')):
            self.assertIsNone(decode_observer_line(line,prefix))

    def test_actual_overlay_recognized_and_diagnostic_text_wrong_context_rejected(self):
        self.assertTrue(fixture_startup_error(self.actual))
        for key,value in [('package','other.app'),('resource-id','ordinary-diagnostic'),('text','Diagnostics: [runtime not ready]: Error: old log')]:
            tree=copy.deepcopy(self.actual)
            next(n for n in tree.iter('node') if n.attrib.get('resource-id')=='host.exp.exponent:id/catalyst_redbox_title').set(key,value)
            self.assertFalse(fixture_startup_error(tree))
        tree=copy.deepcopy(self.actual)
        next(n for n in tree.iter('node') if n.attrib.get('resource-id')=='host.exp.exponent:id/rn_redbox_reload_button').set('package','other.app')
        self.assertFalse(fixture_startup_error(tree))

    def test_hidden_target_wait_action_and_app_capture_fail_before_adb(self):
        with tempfile.TemporaryDirectory() as temp:
            ns=helper_namespace(pathlib.Path(temp));calls=[]
            ns['dump']=lambda *args:self.actual
            ns['adb']=lambda *args,**kwargs:calls.append(args)
            self.actual.append(ET.Element('node',text='Expected hidden target',clickable='true',enabled='true',bounds='[0,0][100,100]'))
            with self.assertRaises(FatalFixtureStartup):ns['wait']('Expected hidden target',seconds=1)
            with self.assertRaises(FatalFixtureStartup):ns['find_action'](self.actual,'Expected hidden target')
            with self.assertRaises(RuntimeError):ns['capture']('app-success')
            self.assertEqual(calls,[])

    def test_failure_only_capture_retains_actual_error_without_dismissal(self):
        with tempfile.TemporaryDirectory() as temp:
            ns=helper_namespace(pathlib.Path(temp));calls=[]
            ns['dump']=lambda *args:self.actual
            def boundary(*args,**kwargs):
                calls.append(args)
                return b'\x89PNG\r\n\x1a\nsynthetic-boundary-test'
            ns['adb']=boundary
            ns['capture']('failure-initializer')
            self.assertEqual(calls,[('exec-out','screencap','-p')])
            self.assertTrue((pathlib.Path(temp)/'failure-initializer.png').exists())

    def test_fatal_initialization_blocks_all_later_callbacks(self):
        with tempfile.TemporaryDirectory() as temp:
            ns=helper_namespace(pathlib.Path(temp));callbacks=[]
            ns['capture']=lambda *args:self.actual
            def fatal():
                callbacks.append('first')
                raise FatalFixtureStartup('actual known initializer failure')
            ns['case']('first',fatal)
            for index in range(8):ns['case']('later-'+str(index),lambda:callbacks.append('unsafe-later'))
            self.assertEqual(callbacks,['first'])
            self.assertEqual([x['result'] for x in ns['REPORT']['cases']],['failed']+['blocked_unattempted']*8)
            self.assertTrue(ns['REPORT']['fixture_startup_unavailable'])

    def test_original_existing_counter_and_outcome_validators_are_retained(self):
        # Historical complete source is retained in the source comparison receipt.
        original=(HERE.parent/'receipts/run-37379451997/baseline/original-baseline_cases.py').read_text()
        old={x.name:ast.dump(x,include_attributes=False) for x in ast.parse(original).body if isinstance(x,ast.FunctionDef)}
        new={x.name:ast.dump(x,include_attributes=False) for x in ast.parse((HERE/'baseline_cases.py').read_text()).body if isinstance(x,ast.FunctionDef)}
        self.assertEqual({k:v for k,v in old.items() if k!='native_records'}, {k:v for k,v in new.items() if k!='native_records'})
        self.assertEqual((HERE/'ui_baseline.py').read_text(),(HERE/'ui_helpers.py').read_text()+(HERE/'baseline_cases.py').read_text())


if __name__=='__main__':unittest.main()
