"""Actual unchanged host helper and camera wrapper; private mocked transport.

Temporary PNG signatures below are explicitly non-rendered protocol fixtures.
No guest, native observation, product pass or external process is established.
"""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

import expo_ordinary_menu as host
from test_camera_host_settling import SyntheticDeviceController, runner

HERE = Path(__file__).resolve().parent
OLD_PATH = HERE / 'observed/frozen-camera-host-runner.py'
OLD_SHA = '2cdaf1311392976a9a4a6f9d36cd63bd5b231152d63276cf0f760fa284338c1f'
spec = importlib.util.spec_from_file_location('frozen_camera_output_scope_runner', OLD_PATH)
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)


def device_init(self, output, state='menu'):
    SyntheticDeviceController.__init__(self, output, state)
    self.png_sequence = 0


def device_adb(self, *args, binary=False):
    result = SyntheticDeviceController.adb(self, *args, binary=binary)
    if args == ('exec-out', 'screencap', '-p'):
        self.png_sequence += 1
        result += ('\nPRIVATE_NON_RENDERED:' + str(self.png_sequence) + ':' + self.state).encode()
    return result


NewDevice = type('PrivateScopedCameraTransport', (runner.RecordingController,),
                 {'__init__': device_init, 'adb': device_adb})
OldDevice = type('PrivateFrozenCameraTransport', (old.RecordingController,),
                 {'__init__': device_init, 'adb': device_adb})


class OwnedRecorder:
    def __init__(self):
        self.calls = []

    def terminate(self):
        self.calls.append('terminate')

    def communicate(self, timeout):
        self.calls.append(('communicate', timeout))
        return b'', b''


class CameraOutputScope(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix='pp-camera-output-pure-')
        self.output = Path(self.folder.name)
        self.patches = [
            patch.object(runner.collector, 'contains', runner.guarded_contains),
            patch.object(runner.collector, 'exact_action', runner.guarded_action),
            patch.object(runner.collector, 'developer_sheet', runner.known_developer_sheet),
            patch('subprocess.run', side_effect=AssertionError('No actual subprocess allowed')),
            patch('subprocess.Popen', side_effect=AssertionError('No actual subprocess allowed')),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.folder.cleanup()

    @staticmethod
    def hashes(directory):
        return {str(path.relative_to(directory)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in directory.rglob('*') if path.is_file()}

    def test_actual_old_two_closures_overwrite_but_scoped_helper_preserves_both(self):
        old_root = self.output / 'old'
        new_root = self.output / 'new'
        old_root.mkdir()
        new_root.mkdir()
        frozen = OldDevice(old_root)
        frozen.ensure_host_clear()
        first_old = self.hashes(old_root)
        old_first_json = json.loads((old_root / 'observed-expo-ordinary-menu-closure.json').read_text())
        frozen.state = 'menu'
        frozen.after_host = 'loading'
        frozen.foreground = frozen.foreground.replace('abcdef', 'abc999')
        frozen.ensure_host_clear()
        self.assertNotEqual(self.hashes(old_root)['observed-expo-ordinary-menu-close-after.png'],
                            first_old['observed-expo-ordinary-menu-close-after.png'])
        self.assertNotEqual(json.loads((old_root / 'observed-expo-ordinary-menu-closure.json').read_text()),
                            old_first_json)
        self.assertEqual(len(list(old_root.rglob('observed-expo-ordinary-menu-closure.json'))), 1)

        scoped = NewDevice(new_root)
        scoped.ensure_host_clear()
        first_dir = new_root / 'camera-host-proofs/closure-1'
        first_new = self.hashes(first_dir)
        scoped.state = 'menu'
        scoped.after_host = 'loading'
        scoped.foreground = scoped.foreground.replace('abcdef', 'abc999')
        scoped.ensure_host_clear()
        second_dir = new_root / 'camera-host-proofs/closure-2'
        self.assertEqual(self.hashes(first_dir), first_new)
        for directory in (first_dir, second_dir):
            self.assertTrue((directory / 'observed-expo-ordinary-menu-close-before.png').exists())
            self.assertTrue((directory / 'observed-expo-ordinary-menu-close-after.png').exists())
            self.assertTrue((directory / 'ordinary-menu-native-before-activities.txt').exists())
            self.assertTrue((directory / 'ordinary-menu-native-after-capture-activities.txt').exists())
            original = json.loads((directory / 'observed-expo-ordinary-menu-closure.json').read_text())
            binding = json.loads((directory / 'host-proof-namespace-binding.json').read_text())
            self.assertEqual(original['before'], 'observed-expo-ordinary-menu-close-before')
            self.assertEqual(original['after'], 'observed-expo-ordinary-menu-close-after')
            self.assertEqual(binding['originalProof'], original)
            self.assertFalse(original['productStatePassed'])
            self.assertFalse(binding['productStatePassed'])
        self.assertEqual(scoped.output, new_root)
        self.assertEqual(scoped.developer_sheet_dismissals, 2)
        self.assertFalse((new_root / 'observed-expo-ordinary-menu-closure.json').exists())
        self.assertEqual(scoped.expo_ordinary_closure['proofDirectory'], 'camera-host-proofs/closure-2')
        self.assertEqual(scoped.report['hostSettling'][0]['proof']['proofDirectory'], 'camera-host-proofs/closure-1')
        self.assertEqual(scoped.report['hostSettling'][1]['proof']['proofDirectory'], 'camera-host-proofs/closure-2')
        self.assertFalse(scoped.report['passed'])

    def test_latest_rebased_proof_supports_unchanged_pair_and_hot_uri_lookups(self):
        c = NewDevice(self.output)
        c._host_settle_active = True
        c.after_host = 'welcome'
        first = c.close_ordinary_menu_scoped()
        c.state = 'menu'
        latest = c.close_ordinary_menu_scoped()
        self.assertEqual(c.expo_ordinary_closure, latest)
        self.assertTrue(first['welcomeObserved'])
        self.assertTrue(latest['welcomeObserved'])
        host.retained_pair(c, first['after'], host.unobscured_welcome)
        host.retained_pair(c, latest['after'], host.unobscured_welcome)
        proof = host.redeliver_original_uri_once(c, c.original_camera_uri)
        self.assertEqual(proof['nativeLaunchState'], 'HOT')
        self.assertFalse(proof['productStatePassed'])
        self.assertEqual(c.events.count('exact-original-uri-protocol'), 1)
        self.assertTrue((self.output / 'observed-exact-original-uri-redelivery.json').exists())
        self.assertFalse(list((self.output / 'camera-host-proofs').rglob('observed-exact-original-uri-redelivery.json')))
        with self.assertRaisesRegex(RuntimeError, 'once-only'):
            host.redeliver_original_uri_once(c, c.original_camera_uri)

    def test_product_capture_stays_at_original_root_and_name(self):
        c = NewDevice(self.output)
        c.ensure_host_clear()
        c.wait('Camera Permission Required', seconds=1)
        self.assertTrue(c.capture('SYNTHETIC-product-original-name', ('Camera Permission Required',)))
        self.assertTrue((self.output / 'SYNTHETIC-product-original-name.png').exists())
        self.assertTrue((self.output / 'SYNTHETIC-product-original-name.xml').exists())
        self.assertFalse(list((self.output / 'camera-host-proofs').rglob('SYNTHETIC-product-original-name.png')))
        self.assertEqual(c.output, self.output)
        self.assertTrue(c._camera_product_media_retained)
        self.assertFalse(c.report['passed'])

    def test_existing_scope_collision_fails_before_any_helper_adb(self):
        c = NewDevice(self.output)
        c._host_settle_active = True
        directory = self.output / 'camera-host-proofs/closure-1'
        directory.mkdir(parents=True)
        marker = directory / 'owned-earlier-evidence.txt'
        marker.write_text('PRIVATE_ORIGINAL_MUST_REMAIN')
        with self.assertRaises(FileExistsError):
            c.close_ordinary_menu_scoped()
        self.assertEqual(c.calls, [])
        self.assertEqual(marker.read_text(), 'PRIVATE_ORIGINAL_MUST_REMAIN')
        self.assertFalse((directory / 'host-proof-namespace-binding.json').exists())
        self.assertEqual(c.output, self.output)

    def test_failed_helper_restores_original_output_without_claim_or_product_media(self):
        c = NewDevice(self.output)
        c._host_settle_active = True
        def failed(proxy):
            self.assertEqual(proxy.output, self.output / 'camera-host-proofs/closure-1')
            self.assertEqual(proxy.owner.output, self.output)
            self.assertEqual(proxy.deadline, c.deadline)
            raise RuntimeError('PRIVATE_PURE_HELPER_FAILURE')
        with patch.object(runner, 'close_ordinary_menu', side_effect=failed), self.assertRaisesRegex(RuntimeError, 'PURE_HELPER'):
            c.close_ordinary_menu_scoped()
        self.assertEqual(c.output, self.output)
        self.assertEqual(c.calls, [])
        binding = json.loads((self.output / 'camera-host-proofs/closure-1/host-proof-namespace-binding.json').read_text())
        self.assertEqual(binding['status'], 'reserved')
        self.assertFalse(binding['productStatePassed'])
        self.assertFalse(list(self.output.rglob('*.png')))

    def actual_owner_with_recorder(self):
        c = object.__new__(runner.RecordingController)
        device_init(c, self.output)
        process = OwnedRecorder()
        c.recording = ('PRIVATE-existing-recorder', '/sdcard/PRIVATE-existing.mp4', process)
        return c, process

    def assert_unsafe_metadata_at_product_root(self, c, process):
        self.assertEqual(c.output, self.output)
        self.assertTrue(c.unsafe_stop)
        self.assertIsNone(c.recording)
        self.assertEqual(process.calls, ['terminate', ('communicate', 5)])
        self.assertTrue((self.output / 'original-camera-recordings.json').exists())
        self.assertFalse(list((self.output / 'camera-host-proofs').rglob('original-camera-recordings.json')))
        self.assertFalse(list(self.output.rglob('*.png')))
        self.assertFalse(any(call[0] in ('pull', 'push') or call[:2] == ('shell', 'input') for call in c.calls))

    def test_actual_unsafe_dump_keeps_owned_recorder_metadata_at_product_root(self):
        c, process = self.actual_owner_with_recorder()
        c._host_settle_active = True
        def boundary(owner, *args, **kwargs):
            if args == ('exec-out', 'cat', '/sdcard/pocketpay-followup-camera-ui.xml'):
                owner.calls.append(args)
                return '<hierarchy><node text="' + 'S' + 'A' * 55 + '"/></hierarchy>'
            return device_adb(owner, *args, **kwargs)
        with patch.object(runner.collector.Controller, 'adb', boundary), self.assertRaises(runner.collector.UnsafeMedia):
            c.close_ordinary_menu_scoped()
        self.assert_unsafe_metadata_at_product_root(c, process)

    def test_actual_adb_failure_keeps_owned_recorder_metadata_at_product_root(self):
        c, process = self.actual_owner_with_recorder()
        c._host_settle_active = True
        def boundary(owner, *args, **kwargs):
            owner.calls.append(args)
            raise subprocess.TimeoutExpired('PRIVATE_ADB_BOUNDARY', 1)
        # The unchanged raw dump's cleanup attempts the owner ADB wrapper;
        # its already-raised unsafe stop refuses that cleanup without a call.
        with patch.object(runner.collector.Controller, 'adb', boundary), self.assertRaises(runner.collector.UnsafeMedia):
            c.close_ordinary_menu_scoped()
        self.assert_unsafe_metadata_at_product_root(c, process)
        self.assertEqual(len(c.calls), 1)

    def test_original_shared_dismissal_and_global_deadline_bounds_remain(self):
        for variant in ('shared-cap', 'global', 'unsafe'):
            with self.subTest(variant=variant), tempfile.TemporaryDirectory(prefix='pp-camera-bound-pure-') as name:
                c = NewDevice(Path(name))
                c._host_settle_active = True
                if variant == 'shared-cap':
                    c.developer_sheet_dismissals = 2
                elif variant == 'global':
                    c.deadline = time.monotonic() - 1
                else:
                    c.unsafe_stop = True
                original_deadline = c.deadline
                with self.assertRaises(RuntimeError):
                    c.close_ordinary_menu_scoped()
                self.assertEqual(c.calls, [])
                self.assertEqual(c.deadline, original_deadline)
                self.assertEqual(c.output, Path(name))

    def test_protected_camera_methods_and_shared_helper_are_exact_frozen_source(self):
        self.assertEqual(hashlib.sha256(OLD_PATH.read_bytes()).hexdigest(), OLD_SHA)
        self.assertEqual(hashlib.sha256((HERE / 'expo_ordinary_menu.py').read_bytes()).hexdigest(),
                         'f1af8f4f431f3627806f6cd3efb3fedb9a7ee2e6adce99dc9d852e3c3790f1a9')
        before_source = OLD_PATH.read_text()
        after_source = (HERE / 'camera-recording-runner.py').read_text()
        before = next(node for node in ast.parse(before_source).body if isinstance(node, ast.ClassDef) and node.name == 'RecordingController')
        after = next(node for node in ast.parse(after_source).body if isinstance(node, ast.ClassDef) and node.name == 'RecordingController')
        old_methods = {node.name: node for node in before.body if isinstance(node, ast.FunctionDef)}
        new_methods = {node.name: node for node in after.body if isinstance(node, ast.FunctionDef)}
        for name in old_methods:
            if name == 'ensure_host_clear':
                self.assertEqual(ast.get_source_segment(after_source, new_methods[name]),
                                 ast.get_source_segment(before_source, old_methods[name]).replace(
                                     'proof = close_ordinary_menu(self)', 'proof = self.close_ordinary_menu_scoped()'))
            else:
                self.assertEqual(ast.dump(old_methods[name]), ast.dump(new_methods[name]), name)
        self.assertEqual(set(new_methods) - set(old_methods), {'close_ordinary_menu_scoped'})
        self.assertEqual(hashlib.sha256((HERE / 'camera/camera_followup.py').read_bytes()).hexdigest(),
                         '4d93f54dc1723a5bcef1e19d145e3d2fc1f66fa2693f81ac9c2ff62225e96345')


if __name__ == '__main__':
    unittest.main(verbosity=2)
