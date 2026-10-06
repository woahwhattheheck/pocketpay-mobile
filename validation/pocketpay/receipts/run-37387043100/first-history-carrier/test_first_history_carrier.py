"""Pure first-launch contract tests; no ADB, device or network execution."""
import copy
import ast
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import baseline_history_carrier as module
import expo_ordinary_menu as host

WELCOME = '<hierarchy><node package="host.exp.exponent" class="android.widget.TextView" enabled="true" text="Welcome to PocketPay" bounds="[10,10][500,80]"/></hierarchy>'
HISTORY = WELCOME.replace('Welcome to PocketPay', 'No wallet available')
ACTIVITY = 'mResumedActivity: ActivityRecord{abc123 u0 host.exp.exponent/.experience.ExperienceActivity t11}\n'


class Adapter:
    def __init__(self, output):
        self.output, self.host = output, host
        self.current = ET.fromstring(WELCOME)
        self.rows = json.loads((Path(__file__).parent/'observed/actual-first-bootstrap-records.json').read_text())
        self.pid = '123'
        self.activity = ACTIVITY
        self.am_result = 'Status: ok\nLaunchState: HOT\n'
        self.calls = []
        self.on_delivery = None
        self.expo_ordinary_closure = {'hostMenuClosedObserved': True, 'welcomeObserved': True,
                                     'activityRecord': 'abc123', 'taskId': 11, 'after': 'closure-after'}
        for suffix in ('.xml','-after.xml'):
            (output/('closure-after'+suffix)).write_text(WELCOME)

    def dump(self, name='current'):
        return copy.deepcopy(self.current), ET.tostring(self.current, encoding='unicode')

    def _records(self):
        return copy.deepcopy(self.rows)

    def _pid(self):
        return self.pid

    @staticmethod
    def _preserved(before, after):
        for prefix in (module.BASELINE, module.VAULT):
            if after[prefix][:len(before[prefix])] != before[prefix]:
                raise RuntimeError('Native history cleared or changed')
            if any(row.get('event') in ('bootstrap-ready','baseline-bootstrap-ready')
                   for row in after[prefix][len(before[prefix]):]):
                raise RuntimeError('Actual fixture rebootstrap')

    def capture(self, name):
        xml = ET.tostring(self.current, encoding='unicode')
        for suffix in ('.xml','-after.xml'):
            (self.output/(name+suffix)).write_text(xml)
        (self.output/(name+'.png')).write_bytes(b'\x89PNG\r\n\x1a\npure-private-test-only')
        return True

    def adb(self, *args, **kwargs):
        self.calls.append(args)
        if args == ('shell','dumpsys','activity','activities'):
            return self.activity
        if args[:3] == ('shell','am','start'):
            for event in ('memory-history-refresh','history-missing','history-instance-mounted'):
                row = copy.deepcopy(self.rows[module.BASELINE][-1])
                row.update(event=event, walletPresent=(event=='memory-history-refresh'))
                row['counters']['historyRefreshes']=1
                if event!='memory-history-refresh':
                    row['counters'].update(historyMounts=1,historyRemovals=1)
                row['transport'].update(reachabilityReads=1,passphraseReads=1)
                self.rows[module.BASELINE].append(row)
            self.current = ET.fromstring(HISTORY)
            if self.on_delivery:
                self.on_delivery()
            return self.am_result
        raise AssertionError('Unexpected guest command: ' + repr(args))


class Harness:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name)
        (self.output/'executed-source.txt').write_text(module.SOURCE+'\n'+module.TREE+'\n')
        self.adapter = Adapter(self.output)
        self.launches, self.taps = [], []
        self.namespace = {'ROOT': self.output, 'BASELINE_HOST_ADAPTER': self.adapter,
            'case': lambda n,c: c(), 'launch': self.launches.append,
            'dump': lambda name='current': self.adapter.dump(name)[0],
            'capture': lambda name,*a,**k: self.adapter.capture(name),
            'tap_node': self.taps.append, 'adb': self.adapter.adb,
            'failure_capture': lambda name: name.startswith('failure-')}
        self.carrier = module.install(self.namespace)
        self.carrier.ordinal = 1
        self.carrier.current_case = module.CASE
        self.namespace['launch'](module.ROUTE)

    def am_count(self):
        return len([c for c in self.adapter.calls if c[:3] == ('shell','am','start')])


class Checks(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'SOURCE_SHA': module.SOURCE}); self.env.start()
        self.block = patch('subprocess.run', side_effect=AssertionError('No actual subprocess allowed')); self.block.start()

    def tearDown(self):
        self.block.stop(); self.env.stop()

    def test_actual_original_first_bootstrap_has_21_and_12_zeros(self):
        h=Harness(); module.validate_records(h.adapter._records())
        self.assertEqual(len(module.COUNTERS),21); self.assertEqual(len(module.TRANSPORT),12)
        self.assertIs(h.adapter.rows[module.BASELINE][-1]['ready'],True)
        self.assertIs(h.adapter.rows[module.BASELINE][-1]['walletPresent'],True)

    def test_exact_once_hot_delivery_retains_host_only_proof_then_original_target(self):
        h=Harness(); tree=h.namespace['dump']('first-target')
        self.assertEqual(h.am_count(),1); self.assertTrue(h.carrier.completed)
        self.assertTrue(any(n.get('text')=='No wallet available' for n in tree.iter('node')))
        proof=json.loads((h.output/'first-history-original-uri-delivery.json').read_text())
        self.assertFalse(proof['productStatePassed']); self.assertEqual(proof['nativeLaunchState'],'HOT')
        h.namespace['dump'](); self.assertEqual(h.am_count(),1)
        self.assertEqual(h.launches,[module.ROUTE])
        self.assertNotIn('force-stop',str(h.adapter.calls))

    def test_original_already_rendered_history_requires_no_uri(self):
        h=Harness(); h.adapter.current=ET.fromstring(HISTORY)
        h.namespace['dump'](); self.assertTrue(h.carrier.target_seen); self.assertEqual(h.am_count(),0)

    def test_any_original_baseline_counter_nonzero_blocks_before_uri(self):
        for key in module.COUNTERS:
            h=Harness(); h.adapter.rows[module.BASELINE][0]['counters'][key]=1
            with self.assertRaisesRegex(RuntimeError,'counter'):
                h.carrier.deliver(h.adapter.current)
            self.assertEqual(h.am_count(),0)

    def test_any_original_transport_read_action_write_nonzero_blocks(self):
        for key in module.TRANSPORT:
            h=Harness(); h.adapter.rows[module.VAULT][0][key]=1
            with self.assertRaisesRegex(RuntimeError,'counter'):
                h.carrier.deliver(h.adapter.current)
            self.assertEqual(h.am_count(),0)

    def test_whole_history_not_just_latest_must_be_zero(self):
        h=Harness(); old=copy.deepcopy(h.adapter.rows[module.BASELINE][0]);old['counters']['historyMounts']=1
        h.adapter.rows[module.BASELINE].insert(0,old)
        with self.assertRaisesRegex(RuntimeError,'counter'):
            h.carrier.deliver(h.adapter.current)
        self.assertEqual(h.am_count(),0)

    def test_missing_or_nonready_actual_records_fail_without_uri(self):
        for variant in ('missing','not-ready','missing-counter','bool-counter'):
            h=Harness()
            if variant=='missing': h.adapter.rows[module.BASELINE]=[]
            elif variant=='not-ready': h.adapter.rows[module.BASELINE][0]['ready']=False
            elif variant=='missing-counter': h.adapter.rows[module.BASELINE][0]['counters'].pop('ledgerReads')
            else: h.adapter.rows[module.BASELINE][0]['counters']['ledgerReads']=False
            with self.assertRaises(RuntimeError):h.carrier.deliver(h.adapter.current)
            self.assertEqual(h.am_count(),0)

    def test_wrong_first_case_source_and_exact_original_url_fail(self):
        for variant in ('ordinal','case','url','two-launches','source','tree'):
            h=Harness()
            if variant=='ordinal': h.carrier.ordinal=2
            elif variant=='case': h.carrier.current_case='create-dummy-masked'
            elif variant=='url': h.carrier.captured_route += '&extra=true'
            elif variant=='two-launches':h.carrier.launch_count=2
            elif variant=='source':(h.output/'executed-source.txt').write_text('wrong\n'+module.TREE+'\n')
            else:(h.output/'executed-source.txt').write_text(module.SOURCE+'\nwrong\n')
            with self.assertRaises(RuntimeError):h.carrier.deliver(h.adapter.current)
            self.assertEqual(h.am_count(),0)

    def test_wrong_environment_source_fails(self):
        h=Harness()
        with patch.dict(os.environ,{'SOURCE_SHA':'wrong'}), self.assertRaisesRegex(RuntimeError,'source environment'):
            h.carrier.deliver(h.adapter.current)
        self.assertEqual(h.am_count(),0)

    def test_target_media_or_action_started_blocks_no_replay(self):
        for field in ('target_seen','product_media_started','action_started'):
            h=Harness();setattr(h.carrier,field,True)
            with self.assertRaisesRegex(RuntimeError,'already started'):h.carrier.deliver(h.adapter.current)
            self.assertEqual(h.am_count(),0)

    def test_full_host_closure_and_uncovered_welcome_are_required(self):
        for variant in ('proof','launcher','menu'):
            h=Harness()
            if variant=='proof':h.adapter.expo_ordinary_closure=None
            elif variant=='launcher':h.adapter.current=ET.fromstring(WELCOME.replace('host.exp.exponent','com.google.android.apps.nexuslauncher'))
            else:h.adapter.current=ET.fromstring('<hierarchy><node package="host.exp.exponent" content-desc="Bottom Sheet"/></hierarchy>')
            with self.assertRaises(RuntimeError):h.carrier.deliver(h.adapter.current)
            self.assertEqual(h.am_count(),0)

    def test_cold_delivery_cannot_poll_resume_or_second_uri(self):
        h=Harness();h.adapter.am_result='Status: ok\nLaunchState: COLD\n'
        with self.assertRaisesRegex(RuntimeError,'HOT'):h.carrier.deliver(h.adapter.current)
        with self.assertRaisesRegex(RuntimeError,'lacks native closure'):h.namespace['dump']()
        with self.assertRaisesRegex(RuntimeError,'once-only'):h.carrier.deliver(h.adapter.current)
        self.assertEqual(h.am_count(),1);self.assertFalse(h.carrier.completed)
        self.assertTrue((h.output/'first-history-observer-before.json').exists())

    def test_pid_or_activity_replacement_after_uri_fails(self):
        for variant in ('pid','activity'):
            h=Harness()
            def altered():
                if variant=='pid':h.adapter.pid='124'
                else:h.adapter.activity=ACTIVITY.replace('abc123','def123')
            h.adapter.on_delivery=altered
            with self.assertRaisesRegex(RuntimeError,'replaced/backgrounded'):h.carrier.deliver(h.adapter.current)
            self.assertEqual(h.am_count(),1);self.assertFalse(h.carrier.completed)

    def test_native_records_rebootstrap_or_action_after_uri_fails(self):
        for variant in ('bootstrap','action','clear'):
            h=Harness()
            def altered():
                if variant=='bootstrap':h.adapter.rows[module.VAULT].append(copy.deepcopy(h.adapter.rows[module.VAULT][0]))
                elif variant=='clear':h.adapter.rows[module.BASELINE]=h.adapter.rows[module.BASELINE][-1:]
                else:h.adapter.rows[module.BASELINE][-1]['counters']['historyHydrations']=1
            h.adapter.on_delivery=altered
            with self.assertRaises(RuntimeError):h.carrier.deliver(h.adapter.current)
            self.assertEqual(h.am_count(),1);self.assertFalse(h.carrier.completed)

    def test_transport_failure_is_not_swallowed_by_ordinary_polling(self):
        h=Harness()
        h.adapter.on_delivery=lambda: (_ for _ in ()).throw(subprocess.TimeoutExpired('am',30))
        with self.assertRaisesRegex(RuntimeError,'transport/XML') as error:h.carrier.deliver(h.adapter.current)
        self.assertIsInstance(error.exception.__cause__,subprocess.TimeoutExpired)
        with self.assertRaisesRegex(RuntimeError,'lacks native closure'):h.namespace['dump']()
        self.assertEqual(h.am_count(),1)

    def test_other_cases_do_not_receive_carrier(self):
        h=Harness();h.carrier.ordinal=2;h.carrier.current_case='sign-real-navigation-return'
        h.namespace['dump']();self.assertEqual(h.am_count(),0)

    def test_original_namespace_action_disarms_carrier_and_taps_once(self):
        h=Harness();node=next(h.adapter.current.iter('node'));h.namespace['tap_node'](node)
        self.assertEqual(len(h.taps),1);self.assertTrue(h.carrier.action_started)
        with self.assertRaisesRegex(RuntimeError,'already started'):h.carrier.deliver(h.adapter.current)
        self.assertEqual(h.am_count(),0)

    def test_carrier_never_resets_deadline_or_imports_camera_redelivery(self):
        source=Path(module.__file__).read_text()
        for forbidden in ('redeliver_original_uri_once','force-stop','deadline =','reload','reset_fixture'):
            self.assertNotIn(forbidden,source)

    def test_actual_original_launch_function_is_wrapped_without_replacing_its_initial_launch(self):
        h=Harness()
        collector=Path(__file__).parent/'observed/original-baseline-ui.py'
        original=next(n for n in ast.parse(collector.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='launch')
        original_commands=[]
        namespace={'adb': lambda *args: original_commands.append(args) or 'Status: ok\nLaunchState: COLD\n',
                   'ROOT':h.output,'PACKAGE':'host.exp.exponent','shlex':module.shlex}
        exec(compile(ast.Module(body=[original],type_ignores=[]),str(collector),'exec'),namespace)
        h.carrier.raw_launch=namespace['launch'];h.carrier.launch_count=0
        h.namespace['launch'](module.ROUTE)
        self.assertEqual(original_commands[0],('shell','am','force-stop','host.exp.exponent'))
        self.assertEqual(len(original_commands),2)
        self.assertIn(module.shlex.quote(module.URI),original_commands[1])
        self.assertEqual(h.carrier.original_uri,module.URI)
        h.namespace['dump']('actual-first-history-poll')
        self.assertEqual(h.am_count(),1)
        self.assertTrue(h.carrier.completed)

    def test_runner_composes_carrier_after_host_install_at_original_anchor_only(self):
        candidate=Path(__file__).parent
        original=(candidate/'observed/original-baseline-host-runner.py').read_text()
        composed=(candidate/'baseline-host-runner.py').read_text()
        old="insertion = 'from baseline_host_adapter import install as install_baseline_host\\ninstall_baseline_host(globals())\\n'"
        new="insertion = 'from baseline_host_adapter import install as install_baseline_host\\ninstall_baseline_host(globals())\\nfrom baseline_history_carrier import install as install_first_history_carrier\\ninstall_first_history_carrier(globals())\\n'"
        self.assertEqual(composed,original.replace(old,new,1))
        values={}
        insertion=next(n for n in ast.parse(composed).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='insertion' for t in n.targets))
        exec(compile(ast.Module(body=[insertion],type_ignores=[]),'runner-install','exec'),values)
        self.assertEqual(values['insertion'].splitlines(),[
            'from baseline_host_adapter import install as install_baseline_host',
            'install_baseline_host(globals())',
            'from baseline_history_carrier import install as install_first_history_carrier',
            'install_first_history_carrier(globals())'])

    def test_exact_natural_mount_sequence_and_single_dummy_reads_only(self):
        h=Harness();before=h.adapter._records();h.carrier.deliver(h.adapter.current)
        after=h.adapter._records();module.validate_natural_append(before,after)
        for variant in ('repeat-refresh','out-of-order','second-removal','extra-read','new-vault-event'):
            altered=copy.deepcopy(after)
            if variant=='repeat-refresh':altered[module.BASELINE].append(copy.deepcopy(altered[module.BASELINE][-1]))
            elif variant=='out-of-order':altered[module.BASELINE][-3:]=list(reversed(altered[module.BASELINE][-3:]))
            elif variant=='second-removal':altered[module.BASELINE][-1]['counters']['historyRemovals']=2
            elif variant=='extra-read':altered[module.BASELINE][-1]['transport']['reachabilityReads']=2
            else:altered[module.VAULT].append(copy.deepcopy(altered[module.VAULT][-1]))
            with self.assertRaises(RuntimeError):
                module.validate_records(altered,after=True)
                module.validate_natural_append(before,altered)

    def test_post_delivery_source_poll_window_expiry_stops_no_resume(self):
        h=Harness()
        with patch.object(module.time,'monotonic',side_effect=[100,130]):
            with self.assertRaisesRegex(RuntimeError,'30-second window'):h.carrier.deliver(h.adapter.current)
        self.assertEqual(h.am_count(),1);self.assertFalse(h.carrier.completed)

    def test_completed_mount_without_child_refresh_is_not_source_order(self):
        h=Harness();before=h.adapter._records();h.carrier.deliver(h.adapter.current)
        after=h.adapter._records();after[module.BASELINE].pop(len(before[module.BASELINE]))
        for row in after[module.BASELINE][len(before[module.BASELINE]):]:
            row['counters']['historyRefreshes']=0
        with self.assertRaisesRegex(RuntimeError,'natural mount event'):
            module.validate_natural_append(before,after)


if __name__=='__main__':unittest.main(verbosity=2)
