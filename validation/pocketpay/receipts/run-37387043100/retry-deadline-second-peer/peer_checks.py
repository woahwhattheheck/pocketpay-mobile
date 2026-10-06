"""Pure review of the exact Retry deadline successor; no device operations."""
import ast
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SUBJECT = ROOT / 'pocketpay-retry-deadline-local-candidate'
OLD = ROOT / 'pocketpay-retry-late-host-local-candidate'
BASE = ROOT / 'pocketpay-remote-native-controller-intro-composed-proposal/validation/pocketpay'
for path in (BASE, BASE/'camera', BASE/'retry', SUBJECT):
    sys.path.insert(0, str(path))
import retry_host_adapter as module
from test_retry_host_adapter import GuestBoundary, host, strict_action, selectors
import observation_helpers
from expo_go_intro import intro_sheet


def definitions(path, names):
    tree = ast.parse(path.read_text())
    return ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])


class PeerChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.clock = {'now': 0.0}
        clock_patch = patch.object(module.time, 'monotonic', side_effect=lambda: self.clock['now'])
        clock_patch.start()
        self.addCleanup(clock_patch.stop)

    def adapter(self, namespace=None, kind='primary'):
        guest = GuestBoundary(self.tmp.name, kind=kind, outcome='failed' if kind=='primary' else 'mismatch')
        adapter = module.RetryHostAdapter(namespace or {'dump': guest.dump, 'adb': guest.adb, 'ROOT': Path(self.tmp.name)},
            kind, host=host, intro_action=strict_action, intro_bounds=selectors.bounds)
        adapter.begin_case('failed' if kind=='primary' else 'mismatch')
        return guest, adapter

    def test_exact_old_recorder_spawn_crosses_cap_new_spawn_is_blocked(self):
        results = {}
        for label, path in (('old', OLD/'retry-primary-ui.py'), ('new', SUBJECT/'retry-primary-ui.py')):
            self.clock['now'] = 0
            guest, adapter = self.adapter()
            spawns = []
            namespace = {'HOST': adapter, 'intro_sheet': intro_sheet, 're': re}
            exec(compile(definitions(path, {'labels', 'contains', 'expo_sheet'}), label+'-actual-sheet', 'exec'), namespace)
            original = namespace['expo_sheet']
            def crosses_after_real_predicate(tree):
                result = original(tree)
                self.clock['now'] = adapter.deadline
                return result
            namespace['expo_sheet'] = crosses_after_real_predicate
            namespace['subprocess'] = type('NoNativeSubprocess', (), {
                'DEVNULL': subprocess.DEVNULL, 'PIPE': subprocess.PIPE,
                'Popen': staticmethod(lambda *args, **kwargs: spawns.append((args, kwargs)) or object()),
            })
            exec(compile(definitions(path, {'begin_recording'}), label+'-actual-recorder', 'exec'), namespace)
            if label == 'new':
                with self.assertRaises(module.RetryBoundExpired):
                    namespace['begin_recording']('pure-peer-no-native-video')
            else:
                namespace['begin_recording']('pure-peer-no-native-video')
            results[label] = len(spawns)
            self.assertEqual(guest.calls, [])
        self.assertEqual(results, {'old': 1, 'new': 0})

    def check_dynamic_dump(self, kind):
        calls = []
        def raw_adb(*args, **kwargs):
            calls.append((args, kwargs, self.clock['now']))
            self.clock['now'] = 600
            return ''
        namespace = {'adb': raw_adb, 'ROOT': Path(self.tmp.name), 're': re, 'ET': ET}
        source = SUBJECT/'retry-primary-ui.py' if kind=='primary' else BASE/'retry/observation_helpers.py'
        if kind=='gap':
            namespace['UnsafeEnvironment'] = observation_helpers.UnsafeEnvironment
        exec(compile(definitions(source, {'dump'}), 'actual-'+kind+'-dump', 'exec'), namespace)
        guest, adapter = self.adapter(namespace, kind)
        namespace['adb'] = adapter.adb
        expected = module.RetryBoundExpired if kind=='primary' else observation_helpers.UnsafeEnvironment
        with self.assertRaises(expected):
            adapter.uncovered(('Sign & Send',), accept=True)
        self.assertEqual(len(calls), 1)  # Started live; no second read or cleanup command.
        self.assertEqual(calls[0][2], 0)
        self.assertEqual(calls[0][1]['timeout'], 20)
        self.assertFalse(adapter.stable)
        self.assertEqual(list(Path(self.tmp.name).iterdir()), [])

    def test_primary_raw_dump_uses_installed_guard_and_rejects_late_return(self):
        self.check_dynamic_dump('primary')

    def test_gap_raw_dump_uses_original_unsafe_type_and_blocks_expired_cleanup(self):
        self.check_dynamic_dump('gap')

    def test_actual_primary_four_case_loop_enters_only_live_first_callback(self):
        calls, callbacks = [], []
        def raw_adb(*args, **kwargs):
            calls.append((args, kwargs, self.clock['now']))
            self.clock['now'] = 600
            return ''
        guest, adapter = self.adapter({'dump': lambda: guest.tree(), 'adb': raw_adb, 'ROOT': Path(self.tmp.name)})
        def callback(outcome):
            callbacks.append(outcome)
            adapter.adb('shell', 'input', 'tap', '1', '1')
        namespace = {'HOST': adapter, 'REPORT': {'cases': []}, 'ROOT': Path(self.tmp.name),
            'time': module.time, 'json': json, 'RetryBoundExpired': module.RetryBoundExpired,
            'retry_outcome': callback, 'capture': lambda *args, **kwargs: self.fail('Expired failure media forbidden')}
        exec(compile(definitions(SUBJECT/'retry-primary-ui.py', {'case'}), 'actual-primary-case', 'exec'), namespace)
        tree = ast.parse((SUBJECT/'retry-primary-ui.py').read_text())
        loop = next(n for n in tree.body if isinstance(n, ast.For) and ast.unparse(n.target)=='outcome')
        exec(compile(ast.Module(body=[loop], type_ignores=[]), 'actual-primary-loop', 'exec'), namespace)
        self.assertEqual(callbacks, ['unknown'])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][2], 0)
        rows = namespace['REPORT']['cases']
        self.assertEqual(rows[0]['result'], 'failed')
        self.assertIn('capture_excluded', rows[0])
        self.assertEqual([r['result'] for r in rows[1:]], ['blocked_unattempted']*3)
        self.assertEqual(adapter.deadline, 600)

    def test_actual_gap_dispatch_blocks_launch_and_rest_after_initial_expiry(self):
        guest, adapter = self.adapter(kind='gap')
        adapter.expired_type = observation_helpers.UnsafeEnvironment
        self.clock['now'] = 600
        launched, callbacks = [], []
        runner = {'host': adapter, 'original_launch': lambda outcome: launched.append(outcome)}
        exec(compile(definitions(SUBJECT/'retry-gap-runner.py', {'launch_independent_case'}), 'actual-gap-launch', 'exec'), runner)
        namespace = {'ROOT': Path(self.tmp.name), 'REPORT': {'cases': [], 'optionalObservations': []},
            'launch': runner['launch_independent_case'], 'UnsafeEnvironment': observation_helpers.UnsafeEnvironment,
            'json': json, 'capture': lambda *args, **kwargs: self.fail('Expired gap media forbidden')}
        source = BASE/'retry/retry_gap_ui.py'
        exec(compile(definitions(source, {'nohash', 'empty', 'mismatch'}), 'immutable-gap-cases', 'exec'), namespace)
        for name in ('nohash', 'empty', 'mismatch'):
            original = namespace[name]
            def observed(name=name, original=original):
                callbacks.append(name)
                return original()
            namespace[name] = observed
        tree = ast.parse(source.read_text())
        start = next(i for i,n in enumerate(tree.body) if isinstance(n,ast.Assign) and ast.unparse(n)=='blocked_reason = None')
        exec(compile(ast.Module(body=tree.body[start:start+2], type_ignores=[]), 'immutable-gap-loop', 'exec'), namespace)
        self.assertEqual(callbacks, ['nohash'])
        self.assertEqual(launched, [])
        self.assertEqual(guest.calls, [])
        self.assertEqual([r['result'] for r in namespace['REPORT']['cases'][1:]], ['blocked/unattempted']*2)

    def test_outcome_helpers_fixtures_and_recorder_arguments_are_preserved(self):
        for filename, names in (('retry-primary-ui.py', {'primary_snapshot', 'retry_outcome'}),
                ('retry-gap-runner.py', {'decoded_native_records', 'launch_independent_case', 'tap_after_host'})):
            self.assertEqual(ast.dump(definitions(OLD/filename, names), include_attributes=False),
                ast.dump(definitions(SUBJECT/filename, names), include_attributes=False))
        old = definitions(OLD/'retry-primary-ui.py', {'begin_recording'})
        new = definitions(SUBJECT/'retry-primary-ui.py', {'begin_recording'})
        new.body[0].body = [n for n in new.body[0].body if not (isinstance(n,ast.Expr) and ast.unparse(n)=='HOST.require_live()')]
        self.assertEqual(ast.dump(old, include_attributes=False), ast.dump(new, include_attributes=False))
        for f in ('expo_ordinary_menu.py', 'observer_framing.py', 'expo_go_intro.py', 'native_overlay.py'):
            self.assertEqual((OLD/f).read_bytes(), (SUBJECT/f).read_bytes())
        for f in (OLD/'fixtures').iterdir():
            self.assertEqual(f.read_bytes(), (SUBJECT/'fixtures'/f.name).read_bytes())


if __name__ == '__main__':
    unittest.main()
