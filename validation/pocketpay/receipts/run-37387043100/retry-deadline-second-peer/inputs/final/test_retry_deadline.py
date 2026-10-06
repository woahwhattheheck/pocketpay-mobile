"""Actual source-derived dispatch checks with zero guest/subprocess calls."""
import ast
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
import subprocess
from types import SimpleNamespace
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
BASE=HERE.parent/'pocketpay-remote-native-controller-intro-composed-proposal/validation/pocketpay'
sys.path.insert(0,str(BASE/'retry'))
sys.path.insert(0,str(HERE))
import observation_helpers as helpers
from test_retry_host_adapter import GuestBoundary
from retry_host_adapter import RetryBoundExpired


def definitions(path,names):
    module=ast.parse(path.read_text())
    return ast.Module(body=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])


class DeadlineChecks(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.guest=GuestBoundary(self.tmp.name,state='review')
        self.adapter=self.guest.adapter()
        self.adapter.deadline=time.monotonic()-1

    def test_expired_uncovered_target_never_calls_raw_dump(self):
        calls=[]
        self.adapter.raw_dump=lambda *args: calls.append(args)
        with self.assertRaises(RetryBoundExpired):self.adapter.uncovered(('Sign & Send',),accept=True)
        self.assertEqual(calls,[]);self.assertEqual(self.guest.calls,[])

    def test_expiry_during_raw_dump_blocks_target_acceptance(self):
        clock=[0]
        self.adapter.deadline=1
        raw=self.guest.dump
        def blocked_dump():
            tree=raw();clock[0]=2;return tree
        self.adapter.raw_dump=blocked_dump
        with patch('retry_host_adapter.time.monotonic',side_effect=lambda:clock[0]):
            with self.assertRaises(RetryBoundExpired):self.adapter.uncovered(('Sign & Send',),accept=True)
        self.assertFalse(self.adapter.stable);self.assertEqual(self.guest.calls,[])

    def test_expiry_during_installed_adb_read_blocks_result(self):
        clock=[0];self.adapter.deadline=1;calls=[]
        def blocked_read(*args,**kwargs):
            calls.append(args);clock[0]=2;return 'result from mocked boundary'
        self.adapter.raw_adb=blocked_read
        with patch('retry_host_adapter.time.monotonic',side_effect=lambda:clock[0]):
            with self.assertRaises(RetryBoundExpired):self.adapter.adb('logcat','-d')
        self.assertEqual(calls,[('logcat','-d')]);self.assertEqual(self.guest.calls,[])

    def test_actual_adb_timeout_is_capped_to_remaining_global_budget(self):
        self.adapter.deadline=1;options=[]
        self.adapter.raw_adb=lambda *args,**kwargs:options.append(kwargs) or 'ok'
        with patch('retry_host_adapter.time.monotonic',return_value=0.75):
            self.assertEqual(self.adapter.adb('logcat','-d',timeout=30,check=False),'ok')
        self.assertEqual(options,[{'timeout':0.25,'check':False}])

    def test_shorter_original_timeout_and_default_gap_timeout_stay_bounded(self):
        self.adapter.deadline=100;options=[]
        self.adapter.raw_adb=lambda *args,**kwargs:options.append(kwargs) or 'ok'
        with patch('retry_host_adapter.time.monotonic',return_value=0):
            self.adapter.adb('logcat','-d',timeout=3)
            self.adapter.kind='gap';self.adapter.adb('logcat','-d')
        self.assertEqual(options,[{'timeout':3},{'timeout':25}])

    def test_timeout_at_global_expiry_is_not_swallowed_as_ordinary_poll(self):
        clock=[0];self.adapter.deadline=1
        def expires(*args,**kwargs):
            clock[0]=2
            raise subprocess.TimeoutExpired('MOCK-BOUNDARY',kwargs['timeout'])
        self.adapter.raw_adb=expires
        with patch('retry_host_adapter.time.monotonic',side_effect=lambda:clock[0]):
            with self.assertRaises(RetryBoundExpired):self.adapter.adb('logcat','-d')
        self.assertEqual(self.guest.calls,[])

    def test_actual_primary_recording_spawn_gate_catches_late_expiry(self):
        clock=[0];self.adapter.deadline=1;spawns=[]
        def checked_tree():return self.guest.tree()
        self.adapter.before_capture=checked_tree
        def predicate(tree):clock[0]=2;return False
        namespace={'HOST':self.adapter,'expo_sheet':predicate,
                   'subprocess':SimpleNamespace(Popen=lambda *args,**kwargs:spawns.append((args,kwargs)),
                                                DEVNULL=-3,PIPE=-1)}
        exec(compile(definitions(HERE/'retry-primary-ui.py',{'begin_recording'}),'actual-primary-recording-spawn','exec'),namespace)
        with patch('retry_host_adapter.time.monotonic',side_effect=lambda:clock[0]):
            with self.assertRaises(RetryBoundExpired):namespace['begin_recording']('expired-never-spawned')
        self.assertEqual(spawns,[]);self.assertEqual(self.guest.calls,[])

    def test_exact_frozen_old_expiry_hole_new_gate_blocks(self):
        old_path=HERE.parent/'pocketpay-retry-late-host-local-candidate/retry_host_adapter.py'
        spec=importlib.util.spec_from_file_location('frozen15ab_retry_host_adapter',old_path)
        old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
        from test_retry_host_adapter import host,strict_action,selectors
        adapter=old.RetryHostAdapter({'dump':self.guest.dump,'adb':self.guest.adb,'ROOT':Path(self.tmp.name)},
                                    'primary',host=host,intro_action=strict_action,intro_bounds=selectors.bounds)
        adapter.begin_case('failed');adapter.deadline=time.monotonic()-1
        self.assertIsNotNone(adapter.uncovered(('Sign & Send',),accept=True))
        with self.assertRaises(RetryBoundExpired):self.adapter.uncovered(('Sign & Send',),accept=True)
        self.assertEqual(self.guest.calls,[])

    def test_expired_installed_primary_adb_never_calls_raw_adb(self):
        module=ast.parse((HERE/'retry-primary-ui.py').read_text())
        assignment=next(n for n in module.body if isinstance(n,ast.Assign) and ast.unparse(n)=='adb = HOST.adb')
        namespace={'HOST':self.adapter}
        exec(compile(ast.Module(body=[assignment],type_ignores=[]),'actual-primary-adb-install','exec'),namespace)
        with self.assertRaises(RetryBoundExpired):namespace['adb']('shell','input','tap','1','1')
        self.assertEqual(self.guest.calls,[])

    def test_actual_primary_four_dispatches_after_expiry_are_blocked(self):
        callbacks=[]
        namespace={'HOST':self.adapter,'REPORT':{'cases':[]},'ROOT':Path(self.tmp.name),
                   'time':time,'json':json,'RetryBoundExpired':RetryBoundExpired,
                   'retry_outcome':lambda outcome:callbacks.append(outcome),
                   'capture':lambda *args,**kwargs: self.fail('expired capture must not run')}
        exec(compile(definitions(HERE/'retry-primary-ui.py',{'case'}),'actual-primary-case','exec'),namespace)
        module=ast.parse((HERE/'retry-primary-ui.py').read_text())
        loop=next(n for n in module.body if isinstance(n,ast.For) and ast.unparse(n.target)=='outcome')
        exec(compile(ast.Module(body=[loop],type_ignores=[]),'actual-primary-four-case-dispatch','exec'),namespace)
        self.assertEqual(callbacks,[]);self.assertEqual(self.guest.calls,[])
        self.assertEqual(len(namespace['REPORT']['cases']),4)
        self.assertTrue(all(row['result']=='blocked_unattempted' for row in namespace['REPORT']['cases']))

    def test_expiry_inside_primary_callback_excludes_media_and_blocks_remaining(self):
        self.adapter.deadline=time.monotonic()+10
        callbacks=[]
        def expires():
            callbacks.append('first');self.adapter.deadline=time.monotonic()-1
            self.adapter.adb('shell','input','tap','1','1')
        namespace={'HOST':self.adapter,'REPORT':{'cases':[]},'ROOT':Path(self.tmp.name),
                   'time':time,'json':json,'RetryBoundExpired':RetryBoundExpired,
                   'capture':lambda *args,**kwargs:self.fail('expired capture must not run')}
        exec(compile(definitions(HERE/'retry-primary-ui.py',{'case'}),'actual-primary-case','exec'),namespace)
        namespace['case']('first',expires)
        namespace['case']('second',lambda:callbacks.append('second'))
        self.assertEqual(callbacks,['first']);self.assertEqual(self.guest.calls,[])
        self.assertIn('capture_excluded',namespace['REPORT']['cases'][0])
        self.assertEqual(namespace['REPORT']['cases'][1]['result'],'blocked_unattempted')

    def test_gap_installed_adb_raises_original_unsafe_class_without_guest(self):
        guest=GuestBoundary(self.tmp.name,kind='gap',outcome='mismatch')
        adapter=guest.adapter();adapter.expired_type=helpers.UnsafeEnvironment
        adapter.deadline=time.monotonic()-1
        namespace={'helpers':type('Namespace',(),{})(),'host':adapter}
        module=ast.parse((HERE/'retry-gap-runner.py').read_text())
        block=next(n for n in module.body if isinstance(n,ast.If) and '__name__' in ast.unparse(n.test))
        assignment=next(n for n in block.body if isinstance(n,ast.Assign) and ast.unparse(n)=='helpers.adb = host.adb')
        exec(compile(ast.Module(body=[assignment],type_ignores=[]),'actual-gap-adb-install','exec'),namespace)
        with self.assertRaises(helpers.UnsafeEnvironment):namespace['helpers'].adb('logcat','-c')
        self.assertEqual(guest.calls,[])

    def test_actual_immutable_gap_dispatch_expiry_blocks_remaining_callbacks(self):
        guest=GuestBoundary(self.tmp.name,kind='gap',outcome='mismatch')
        adapter=guest.adapter();adapter.expired_type=helpers.UnsafeEnvironment
        adapter.deadline=time.monotonic()-1
        launched=[];callbacks=[]
        runner={'host':adapter,'original_launch':lambda outcome:launched.append(outcome)}
        exec(compile(definitions(HERE/'retry-gap-runner.py',{'launch_independent_case'}),'actual-gap-launch-wrapper','exec'),runner)
        namespace={'ROOT':Path(self.tmp.name),'REPORT':{'cases':[],'optionalObservations':[]},
                   'launch':runner['launch_independent_case'],'UnsafeEnvironment':helpers.UnsafeEnvironment,
                   'json':json,'capture':lambda *args,**kwargs:self.fail('unsafe expiry must not capture')}
        original=BASE/'retry/retry_gap_ui.py'
        exec(compile(definitions(original,{'nohash','empty','mismatch'}),'immutable-gap-case-definitions','exec'),namespace)
        for name in ('nohash','empty','mismatch'):
            real=namespace[name]
            def spy(name=name,real=real):callbacks.append(name);return real()
            namespace[name]=spy
        module=ast.parse(original.read_text())
        start=next(i for i,n in enumerate(module.body) if isinstance(n,ast.Assign) and ast.unparse(n)=='blocked_reason = None')
        exec(compile(ast.Module(body=module.body[start:start+2],type_ignores=[]),'immutable-gap-dispatch-loop','exec'),namespace)
        self.assertEqual(callbacks,['nohash']);self.assertEqual(launched,[]);self.assertEqual(guest.calls,[])
        rows=namespace['REPORT']['cases'];self.assertEqual(len(rows),3)
        self.assertIn('captureExcluded',rows[0])
        self.assertTrue(all(row['result']=='blocked/unattempted' for row in rows[1:]))

    def test_beginning_independent_case_does_not_reset_global_clock(self):
        self.adapter.deadline=time.monotonic()+10;deadline=self.adapter.deadline
        self.adapter.begin_case('unknown');self.adapter.begin_case('confirmed')
        self.assertEqual(self.adapter.deadline,deadline)
        self.adapter.deadline=time.monotonic()-1
        with self.assertRaises(RetryBoundExpired):self.adapter.begin_case('failed')
        self.assertEqual(self.adapter.outcome,'confirmed')

    def test_outcome_validators_and_immutable_fixture_files_stay_exact(self):
        old=HERE.parent/'pocketpay-retry-late-host-local-candidate'
        for filename,names in [('retry-primary-ui.py',{'primary_snapshot','retry_outcome'}),('retry-gap-runner.py',{'decoded_native_records'})]:
            self.assertEqual(ast.dump(definitions(old/filename,names),include_attributes=False),
                             ast.dump(definitions(HERE/filename,names),include_attributes=False))
        for filename in ('expo_ordinary_menu.py','observer_framing.py','expo_go_intro.py','native_overlay.py'):
            self.assertEqual((old/filename).read_bytes(),(HERE/filename).read_bytes())


if __name__=='__main__':unittest.main()
