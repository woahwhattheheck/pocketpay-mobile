"""Pure controller differential checks; no ADB, guest, network or product writes."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import runpy
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import baseline_host_adapter as module
import expo_ordinary_menu as strict_host

PRODUCT = '<hierarchy><node package="host.exp.exponent" class="android.widget.TextView" text="Diagnostics" enabled="true" bounds="[1,1][50,50]"/></hierarchy>'
INTRO = (Path(__file__).parent / 'observed/baseline-history-intro.xml').read_text()
MENU = (Path(__file__).parent / 'observed/ordinary-menu.xml').read_text()


def baseline(event='diagnostics-mounted'):
    return {'event': event, 'ready': True, 'counters': {'walletSaveAttempts': 0, 'backupAttempts': 0, 'clipboardAttempts': 0},
            'transport': {'secretAccess': 0, 'broadcastAttempts': 0, 'deposit': 0, 'withdraw': 0}}


class Harness:
    def __init__(self, xml=PRODUCT):
        self.temp = tempfile.TemporaryDirectory()
        self.current = ET.fromstring(xml)
        self.pid = '123'
        self.rows = {module.PREFIXES[0]: [baseline()], module.PREFIXES[1]: [dict(event='bootstrap-ready', **baseline()['transport'])]}
        self.calls = []
        self.tap_count = 0
        self.on_capture = None
        self.on_close = None
        self.on_swipe = None
        self.namespace = {'ROOT': Path(self.temp.name), 'dump': self.dump, 'adb': self.adb,
                          'tap_node': self.tap, 'case': self.case, 'REPORT': {'cases': []},
                          'failure_capture': lambda n: n.startswith('failure-') or n == 'unmatched-state',
                          'native_error': lambda t: False}

    def dump(self, name='current'):
        self.namespace['ROOT'].joinpath(name+'.xml').write_text(ET.tostring(self.current, encoding='unicode'))
        return copy.deepcopy(self.current)

    def adb(self, *args, **kwargs):
        self.calls.append(args)
        if args == ('shell', 'pidof', 'host.exp.exponent'):
            return self.pid
        if args[:3] == ('logcat', '-d', '-s'):
            return '\n'.join(p + ' ' + json.dumps(r) for p, rows in self.rows.items() for r in rows)
        if args == ('exec-out', 'screencap', '-p'):
            if self.on_capture:
                self.on_capture()
            return b'\x89PNG\r\n\x1a\nactual-test-byte-boundary'
        if args[:3] == ('shell', 'input', 'swipe') and self.on_swipe:
            self.on_swipe()
            return ''
        raise AssertionError('Unexpected guest command: ' + repr(args))

    def tap(self, node):
        self.tap_count += 1

    def case(self, name, callback):
        callback()

    def options(self):
        owner = self

        class Host:
            overlay_guard = staticmethod(strict_host.overlay_guard)
            has_host_sheet = staticmethod(strict_host.has_host_sheet)
            unobscured_host = staticmethod(strict_host.unobscured_host)

            @staticmethod
            def close_ordinary_menu(adapter):
                if owner.on_close:
                    owner.on_close(adapter)
                else:
                    # Confirm the adapter proof calls only its bound raw dump,
                    # even though namespace product dump is already wrapped.
                    adapter.capture('host-before', allow_developer_sheet=True)
                    owner.current = ET.fromstring(PRODUCT)
                    adapter.capture('host-after')
                adapter.developer_sheet_dismissals += 1

        return {'host': Host, 'action': lambda *a: None, 'bounds': lambda n: (1, 1, 2, 2)}

    def adapter(self):
        return module.install(self.namespace, **self.options())


class Checks(unittest.TestCase):
    def setUp(self):
        self.block = patch('subprocess.run', side_effect=AssertionError('No real subprocess permitted'))
        self.block.start()

    def tearDown(self):
        self.block.stop()

    def test_actual_intro_no_longer_qualifies_hidden_product_labels(self):
        h = Harness(INTRO)
        a = h.adapter()
        def dismissed(adapter, tree, *args):
            h.current = ET.fromstring(MENU)
            adapter.developer_sheet_dismissals += 1
        with patch.object(module, 'dismiss_observed_intro', side_effect=dismissed):
            tree = h.namespace['dump']()
        self.assertFalse(module.intro_sheet(tree))
        self.assertFalse(strict_host.has_host_sheet(tree))
        self.assertEqual(a.developer_sheet_dismissals, 2)
        self.assertEqual(a.closures, 1)
        self.assertFalse(json.loads((a.output/'baseline-host-state-preservation.json').read_text())['productStatePassed'])

    def test_raw_host_capture_does_not_recursively_settle(self):
        h = Harness(MENU); a = h.adapter()
        h.namespace['dump']()
        self.assertEqual(a.closures, 1)
        self.assertTrue((a.output/'host-before.png').exists())
        self.assertTrue((a.output/'host-after.png').exists())

    def test_pid_change_fails(self):
        h = Harness(MENU); a = h.adapter()
        def close(adapter):
            h.current = ET.fromstring(PRODUCT); h.pid = '124'
        h.on_close = close
        with self.assertRaisesRegex(RuntimeError, 'replaced'):
            a.uncovered()

    def test_cleared_original_records_fail(self):
        h = Harness(MENU); a = h.adapter()
        def close(adapter):
            h.current = ET.fromstring(PRODUCT); h.rows = {p: [] for p in module.PREFIXES}
        h.on_close = close
        with self.assertRaisesRegex(RuntimeError, 'history changed'):
            a.uncovered()

    def test_nonzero_write_counter_fails_before_host_action(self):
        h = Harness(MENU)
        h.rows[module.PREFIXES[0]][0]['counters']['walletSaveAttempts'] = 1
        a = h.adapter()
        with self.assertRaisesRegex(RuntimeError, 'write counter'):
            a.uncovered()
        self.assertFalse(any(args[:2] == ('exec-out', 'screencap') for args in h.calls))

    def test_rebootstrap_rejects_reset(self):
        h = Harness(MENU); a = h.adapter()
        def close(adapter):
            h.current = ET.fromstring(PRODUCT)
            h.rows[module.PREFIXES[1]].append(dict(event='bootstrap-ready', **baseline()['transport']))
        h.on_close = close
        with self.assertRaisesRegex(RuntimeError, 'reinitialized'):
            a.uncovered()

    def test_baseline_ready_event_rejects_later_rebootstrap(self):
        before = {module.PREFIXES[0]: [baseline()], module.PREFIXES[1]: []}
        after = copy.deepcopy(before)
        after[module.PREFIXES[0]].append(baseline('baseline-bootstrap-ready'))
        with self.assertRaisesRegex(RuntimeError, 'reinitialized'):
            module.BaselineHostAdapter._preserved(before, after)

    def test_first_ready_may_complete_from_unready_initialization(self):
        old = baseline('initializing'); old['ready'] = False
        before = {module.PREFIXES[0]: [old], module.PREFIXES[1]: []}
        after = copy.deepcopy(before)
        after[module.PREFIXES[0]].append(baseline('baseline-bootstrap-ready'))
        module.BaselineHostAdapter._preserved(before, after)

    def test_new_png_overlay_is_rejected_without_saved_image(self):
        h = Harness(); a = h.adapter()
        h.on_capture = lambda: setattr(h, 'current', ET.fromstring(INTRO))
        with self.assertRaisesRegex(RuntimeError, 'Late host overlay'):
            h.namespace['capture']('baseline-ready')
        self.assertFalse((a.output/'baseline-ready.png').exists())

    def test_exact_action_is_refreshed_not_replayed(self):
        h = Harness(); a = h.adapter(); node = next(h.current.iter('node'))
        h.namespace['tap_node'](node)
        self.assertEqual(h.tap_count, 1)
        h.current = ET.fromstring(PRODUCT.replace('Diagnostics', 'Different'))
        with self.assertRaisesRegex(RuntimeError, 'changed'):
            h.namespace['tap_node'](node)
        self.assertEqual(h.tap_count, 1)

    def test_recognized_transport_failure_cannot_be_poll_swallowed(self):
        h = Harness(INTRO); a = h.adapter()
        with patch.object(module, 'dismiss_observed_intro', side_effect=ET.ParseError('actual-boundary')):
            with self.assertRaisesRegex(RuntimeError, 'transport/XML') as error:
                a.uncovered()
        self.assertIsInstance(error.exception.__cause__, ET.ParseError)

    def test_global_bound_blocks_remaining_callbacks_and_guest_commands(self):
        h = Harness(); a = h.adapter(); before_deadline = a.deadline
        with patch.object(module.time, 'monotonic', return_value=before_deadline+1):
            with self.assertRaisesRegex(RuntimeError, '600-second'):
                h.namespace['dump']()
            h.namespace['case']('remaining', lambda: self.fail('Callback must not run'))
        self.assertEqual(h.calls, [])
        self.assertEqual(h.namespace['REPORT']['cases'][0]['result'], 'blocked_unattempted')
        self.assertEqual(a.deadline, before_deadline)

    def test_failure_capture_retains_actual_host_without_dismissal(self):
        h = Harness(INTRO); a = h.adapter()
        h.namespace['capture']('failure-target')
        self.assertEqual(a.closures, 0)
        self.assertTrue((a.output/'failure-target.png').exists())

    def test_named_dump_interface_retains_fresh_uncovered_hierarchy(self):
        h = Harness(MENU); a = h.adapter()
        tree = h.namespace['dump']('vault-form-discovery-0')
        retained = ET.parse(a.output/'vault-form-discovery-0.xml').getroot()
        self.assertFalse(strict_host.has_host_sheet(tree))
        self.assertFalse(strict_host.has_host_sheet(retained))

    def test_root_vault_discovery_calls_installed_named_dump_and_bounded_adb(self):
        import baseline_vault_form
        h = Harness((Path(__file__).parent/'observed/vault-initial.xml').read_text())
        h.namespace['find_action'] = lambda tree, label: next((n for n in tree.iter('node')
            if n.get('text') == label and n.get('clickable') == 'true' and n.get('enabled') == 'true'), None)
        form = ('<hierarchy><node package="host.exp.exponent" class="android.widget.EditText" enabled="true" bounds="[20,20][300,80]"/>'
                '<node package="host.exp.exponent" class="android.widget.Button" text="Set Aside for 30 Days" enabled="true" clickable="true" bounds="[20,100][300,170]"/></hierarchy>')
        h.on_swipe = lambda: setattr(h, 'current', ET.fromstring(form))
        a = h.adapter()
        tree = baseline_vault_form.observe_vault_form(h.namespace)
        self.assertTrue(h.namespace['find_action'](tree, 'Set Aside for 30 Days') is not None)
        self.assertTrue((a.output/'vault-form-discovery-0.xml').exists())
        self.assertTrue((a.output/'vault-form-discovery-1.xml').exists())
        self.assertEqual(len([c for c in h.calls if c[:3] == ('shell', 'input', 'swipe')]), 1)
        self.assertFalse(any(c[:3] == ('shell', 'input', 'tap') for c in h.calls))

    def test_adapter_has_no_uri_or_reset_guest_commands(self):
        source = Path(module.__file__).read_text()
        for prohibited in ('redeliver_original_uri_once', "'force-stop'", "'start'", "'logcat', '-c'"):
            self.assertNotIn(prohibited, source)

    def test_actual_runner_executes_original_nine_case_dispatch_through_bound(self):
        p = Path(__file__).parent
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); (root/'baseline').mkdir(); (root/'evidence').mkdir()
            shutil.copy2(p/'baseline-host-runner.py', root/'baseline-host-runner.py')
            shutil.copy2(p/'observed/root-target-ui.py', root/'baseline/ui_baseline.py')
            original_install = module.install
            def expired_install(namespace):
                adapter = original_install(namespace, host=strict_host, action=lambda *a: None, bounds=lambda n: (1,1,2,2))
                adapter.deadline = module.time.monotonic()-1
                return adapter
            with patch.object(module, 'install', side_effect=expired_install), patch.dict(os.environ, {
                'ARTIFACT_DIR': str(root/'evidence'), 'SOURCE_SHA': '52ce8006a2d091a4c9f29852a1a530750ff9b3cc'}), \
                 patch.object(sys, 'argv', ['baseline-host-runner.py','baseline']), patch('builtins.print'):
                with self.assertRaises(SystemExit) as exit_value:
                    runpy.run_path(str(root/'baseline-host-runner.py'), run_name='__main__')
            self.assertEqual(exit_value.exception.code, 1)
            records = json.loads((root/'evidence/observations.json').read_text())['cases']
            self.assertEqual(len(records), 9)
            self.assertTrue(all(r['result'] == 'blocked_unattempted' for r in records))


if __name__ == '__main__':
    unittest.main(verbosity=2)
