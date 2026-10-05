"""Pure controller policy checks with synthetic temporary inputs; no ADB/native evidence."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('camera_recording_runner', HERE / 'camera-recording-runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class StubController(runner.RecordingController):
    def __init__(self, output, case):
        # Do not initialize a real checkout, guest, fixture or camera hook.
        self.serial = 'SYNTHETIC_NO_DEVICE'
        self.output = output
        self.source_checkout = output / 'SYNTHETIC_NO_CHECKOUT'
        self.deadline = time.monotonic() + 600
        self.suite = 'primary-and-user-fixed'
        self.loading = {'scan': [], 'contacts': []}
        self.developer_sheet_dismissals = 0
        self.recording = None
        self.unsafe_stop = False
        self.video_sequence = 0
        self.video_records = []
        self.send_exit = None
        self.original_contacts_callback_completed = False
        self.send_result = {'status': 'not_attempted', 'passed': False}
        self.report = {'cases': [], 'passed': False}
        self.case = case
        self.events = []
        (output / 'guest-only-fresh-data-reset.txt').write_text('Success\n')

    def adb(self, *args, **kwargs):
        # Only the original collector's inventory parser receives synthetic
        # values. Any guest action is an unexpected test failure.
        if args == ('shell', 'getprop', 'ro.build.version.sdk'):
            return '34\n'
        if args == ('shell', 'wm', 'size'):
            return 'Physical size: 720x1280\n'
        if args == ('shell', 'dumpsys', 'package', runner.collector.PACKAGE):
            return 'versionName=54.0.8\n'
        if self.case in ('contacts-transfer', 'final-transfer') and args and args[0] == 'pull':
            self.stop_unsafe()
            raise runner.subprocess.SubprocessError('Synthetic Contacts recording transfer failure')
        if self.case in ('original-secret', 'original-error-overlay'):
            if args[:3] == ('shell', 'uiautomator', 'dump') or args[:3] == ('shell', 'rm', '-f'):
                return ''
            if args[:2] == ('exec-out', 'cat'):
                text = 'S' + 'A' * 55 if self.case == 'original-secret' else 'Render Error'
                return '<hierarchy><node text="' + text + '"/></hierarchy>'
        raise AssertionError('No device operation is permitted in this pure test')

    def denied_manual(self):
        self.events.append('original-scan-denied')
        if self.case in ('original-secret', 'original-error-overlay'):
            self.dump()

    def unavailable_manual(self):
        self.events.append('original-os-grant-phase')
        # Synthetic bytes only. They are temporary and cannot support a native
        # claim; the child controller is stubbed and is never executed here.
        (self.output / 'scan-actual-os-grant-dialog.xml').write_text('<synthetic-test/>')
        if self.case != 'missing-grant':
            (self.output / 'scan-actual-os-grant-dialog.png').write_bytes(b'SYNTHETIC_NOT_PNG')


class IntegrationPolicy(unittest.TestCase):
    def run_case(self, child_exit, case='normal'):
        with tempfile.TemporaryDirectory(prefix='pp-controller-policy-') as name:
            output = Path(name) / 'camera-primary'
            output.mkdir()
            controller = StubController(output, case)

            def contacts(instance):
                instance.events.append('original-contacts-completed')
                (instance.output / 'contacts-unavailable-native-permission.txt').write_text('android.permission.CAMERA: granted=true\n')
                if case == 'contacts-transfer':
                    process = SimpleNamespace(returncode=0, communicate=lambda **kwargs: (b'', b''))
                    instance.recording = ('synthetic-contacts-not-media', '/sdcard/synthetic.mp4', process)

            def reset(instance):
                instance.events.append('independent-force-stop-revoke-reset')

            def contacts_fixed(instance):
                instance.events.append('original-contacts-user-fixed')
                if case == 'final-transfer':
                    process = SimpleNamespace(returncode=0, communicate=lambda **kwargs: (b'', b''))
                    instance.recording = ('synthetic-final-not-media', '/sdcard/synthetic.mp4', process)

            def child(command, **kwargs):
                controller.events.append('separate-send-child')
                self.assertEqual(controller.events[-2], 'original-contacts-completed')
                self.assertNotIn('independent-force-stop-revoke-reset', controller.events)
                receipt = Path(command[command.index('--owner-prerequisite-receipt') + 1])
                data = json.loads(receipt.read_text())
                self.assertEqual(data['sourceSha'], runner.collector.SOURCE_SHA)
                self.assertEqual(len(data['actualOsGrantEvidence']), 3)
                for item in data['actualOsGrantEvidence']:
                    self.assertEqual(runner.hashlib.sha256(Path(item['path']).read_bytes()).hexdigest(), item['sha256'])
                if case == 'timeout':
                    raise runner.subprocess.TimeoutExpired(command, 1)
                child_output = Path(command[command.index('--artifacts') + 1])
                child_output.mkdir()
                report_exit = 0 if case == 'mismatched-report' else child_exit
                (child_output / 'observations.json').write_text(json.dumps({
                    'exitCode': report_exit, 'passed': report_exit == 0,
                    'safeToAttemptNextIndependentCase': report_exit != 2,
                    'status': 'synthetic_protocol_only', 'nativeExecution': False}))
                return SimpleNamespace(returncode=child_exit)

            with patch.object(runner.collector.Controller, 'contacts_unavailable_manual', contacts), \
                 patch.object(runner.collector.Controller, 'user_fixed_manual', reset), \
                 patch.object(runner.collector.Controller, 'contacts_user_fixed_manual', contacts_fixed), \
                 patch.object(runner.subprocess, 'run', child):
                result = controller.run()
            return result, controller.report, controller.events

    def test_success_keeps_contacts_result_and_orders_send_before_reset(self):
        result, report, events = self.run_case(0)
        self.assertEqual(result, 0)
        self.assertTrue(report['passed'])
        self.assertTrue(report['originalCameraCasesPassed'])
        self.assertEqual(report['cases'][2]['result'], 'passed')
        self.assertLess(events.index('separate-send-child'), events.index('independent-force-stop-revoke-reset'))

    def test_ordinary_send_failure_remains_failure_and_next_case_uses_reset(self):
        result, report, events = self.run_case(1)
        self.assertEqual(result, 1)
        self.assertFalse(report['passed'])
        self.assertTrue(report['originalCameraCasesPassed'])
        self.assertEqual(report['cases'][2]['result'], 'passed')
        self.assertIn('independent-force-stop-revoke-reset', events)

    def assert_blocked(self, result, report, events):
        self.assertEqual(result, 2)
        self.assertFalse(report['passed'])
        self.assertEqual(report['cases'][2]['result'], 'passed')
        self.assertEqual([item['result'] for item in report['cases'][3:]], ['blocked_unattempted', 'blocked_unattempted'])
        self.assertFalse(report['safeToAttemptNextIndependentCase'])
        self.assertNotIn('independent-force-stop-revoke-reset', events)
        self.assertNotIn('original-contacts-user-fixed', events)

    def test_unsafe_send_blocks_both_remaining_callbacks_without_actions(self):
        self.assert_blocked(*self.run_case(2))

    def test_mismatched_child_report_fails_closed(self):
        self.assert_blocked(*self.run_case(1, 'mismatched-report'))

    def test_child_timeout_fails_closed_without_raw_error_retention(self):
        self.assert_blocked(*self.run_case(1, 'timeout'))

    def test_missing_real_grant_artifact_blocks_without_child_execution(self):
        result, report, events = self.run_case(0, 'missing-grant')
        self.assert_blocked(result, report, events)
        self.assertNotIn('separate-send-child', events)

    def test_contacts_transfer_failure_blocks_send_launch_preserving_original_callback(self):
        result, report, events = self.run_case(0, 'contacts-transfer')
        self.assert_blocked(result, report, events)
        self.assertTrue(report['originalContactsCallbackCompleted'])
        self.assertEqual(report['sendPreservation']['status'], 'blocked_unattempted')
        self.assertNotIn('separate-send-child', events)

    def test_final_transfer_failure_is_included_in_aggregate_safety_status(self):
        result, report, events = self.run_case(0, 'final-transfer')
        self.assertEqual(result, 2)
        self.assertFalse(report['passed'])
        self.assertFalse(report['safeToAttemptNextIndependentCase'])
        self.assertTrue(report['originalCameraCasesPassed'])
        self.assertTrue(all(item['result'] == 'passed' for item in report['cases']))

    def test_original_camera_secret_is_unsafe_exit2_not_swallowed_exit1(self):
        result, report, events = self.run_case(0, 'original-secret')
        self.assertEqual(result, 2)
        self.assertFalse(report['safeToAttemptNextIndependentCase'])
        self.assertEqual(len(report['cases']), 5)
        self.assertTrue(all(item['result'] == 'blocked_unattempted' for item in report['cases'][1:]))
        self.assertNotIn('original-os-grant-phase', events)
        self.assertNotIn('separate-send-child', events)

    def test_original_render_error_is_unsafe_and_blocks_remaining_cases(self):
        result, report, events = self.run_case(0, 'original-error-overlay')
        self.assertEqual(result, 2)
        self.assertTrue(report['unsafeStop'])
        self.assertNotIn('original-os-grant-phase', events)

    def test_active_recording_is_stopped_without_pull_after_unsafe(self):
        with tempfile.TemporaryDirectory(prefix='pp-recorder-policy-') as name:
            controller = StubController(Path(name), 'normal')
            calls = []
            process = SimpleNamespace(terminate=lambda: calls.append('owned-local-terminate'),
                                      communicate=lambda **kwargs: (b'', b''),
                                      kill=lambda: calls.append('owned-local-kill'))
            controller.recording = ('synthetic-not-media', '/sdcard/synthetic.mp4', process)
            controller.stop_unsafe()
            controller.finish_recording()
            self.assertEqual(calls, ['owned-local-terminate'])
            self.assertIsNone(controller.recording)
            self.assertTrue(controller.video_records[0]['excluded'])
            self.assertFalse(any(Path(name).glob('*.mp4')))

    def test_failed_video_pull_has_no_direct_guest_cleanup_or_partial_retention(self):
        with tempfile.TemporaryDirectory(prefix='pp-recorder-transfer-policy-') as name:
            root = Path(name)
            controller = StubController(root, 'normal')
            process = SimpleNamespace(returncode=0, communicate=lambda **kwargs: (b'', b''))
            controller.recording = ('synthetic-not-media', '/sdcard/synthetic.mp4', process)
            def failed_pull(*args, **kwargs):
                (root / 'synthetic-not-media-original.mp4').write_bytes(b'SYNTHETIC_PARTIAL_NOT_MEDIA')
                controller.stop_unsafe()
                raise runner.subprocess.SubprocessError('Synthetic transfer failure')
            controller.adb = failed_pull
            with patch.object(runner.subprocess, 'run', side_effect=AssertionError('No direct guest cleanup allowed')):
                controller.finish_recording()
            self.assertFalse((root / 'synthetic-not-media-original.mp4').exists())
            self.assertTrue(controller.video_records[0]['excluded'])

    def test_new_recorder_is_not_spawned_after_finish_marks_unsafe(self):
        with tempfile.TemporaryDirectory(prefix='pp-recorder-start-policy-') as name:
            controller = StubController(Path(name), 'normal')
            def unsafe_finish():
                controller.unsafe_stop = True
            controller.finish_recording = unsafe_finish
            with patch.object(runner.subprocess, 'Popen', side_effect=AssertionError('No new recorder allowed')):
                with self.assertRaises(runner.collector.UnsafeMedia):
                    controller.begin_recording('synthetic', 8)
                with self.assertRaises(runner.collector.UnsafeMedia):
                    controller.begin_recording('synthetic', 8)

    def run_independent_suite_branch(self, primary_exit):
        # Execute the actual isolated shell branch with command stubs. The
        # surrounding Android/Metro workflow is never executed by these checks.
        source = (HERE / 'run.sh').read_text()
        start = source.index('  if [[ "$primary_exit" == 2 ]]; then')
        end = source.index('  python3 - "$evidence" "$primary_exit" "$contacts_exit"', start)
        branch = source[start:end]
        with tempfile.TemporaryDirectory(prefix='pp-suite-policy-') as name:
            root = Path(name)
            script = r'''set -euo pipefail
primary_exit="$PP_TEST_PRIMARY_EXIT"
evidence="$PP_TEST_EVIDENCE"
serial=SYNTHETIC_NO_DEVICE
controller=SYNTHETIC_NO_CONTROLLER
subject=SYNTHETIC_NO_CHECKOUT
mkdir -p "$evidence"
adb() {
  printf 'adb %s\n' "$*" >> "$PP_TEST_LOG"
  if [[ "$primary_exit" == 2 ]]; then return 99; fi
  if [[ "$*" == *'shell pm clear host.exp.exponent' ]]; then printf 'Success\n'; fi
}
python3() {
  printf 'collector %s\n' "$*" >> "$PP_TEST_LOG"
  if [[ "$primary_exit" == 2 ]]; then return 98; fi
  return 0
}
''' + branch + '\nprintf "%s\\n" "$contacts_exit" > "$PP_TEST_RESULT"\n'
            env = dict(os.environ, PP_TEST_PRIMARY_EXIT=str(primary_exit),
                       PP_TEST_EVIDENCE=str(root / 'evidence'), PP_TEST_LOG=str(root / 'calls.txt'),
                       PP_TEST_RESULT=str(root / 'result.txt'))
            process = runner.subprocess.run(['bash', '-c', script], env=env, capture_output=True,
                                            text=True, timeout=5, check=True)
            calls = (root / 'calls.txt').read_text() if (root / 'calls.txt').exists() else ''
            result = int((root / 'result.txt').read_text())
            blocked = root / 'evidence/contacts-first-denial/observations.json'
            return result, calls, json.loads(blocked.read_text()) if blocked.exists() else None

    def test_shell_unsafe_result_retains_blocked_suite_with_zero_commands(self):
        result, calls, report = self.run_independent_suite_branch(2)
        self.assertEqual(result, 2)
        self.assertEqual(calls, '')
        self.assertEqual(report['result'], 'blocked_unattempted')
        self.assertFalse(report['nativeExecution'])

    def test_shell_ordinary_failure_uses_fresh_reset_before_next_collector(self):
        result, calls, report = self.run_independent_suite_branch(1)
        self.assertEqual(result, 0)
        self.assertIsNone(report)
        self.assertLess(calls.index('shell am force-stop'), calls.index('shell pm clear'))
        self.assertLess(calls.index('shell pm clear'), calls.index('reverse tcp:8081'))
        self.assertLess(calls.index('reverse tcp:8081'), calls.index('collector '))

    def run_cleanup_branch(self, primary_exit, contacts_exit):
        source = (HERE / 'run.sh').read_text()
        start = source.index('cleanup() {')
        end = source.index('\ntrap cleanup EXIT', start)
        cleanup = source[start:end]
        with tempfile.TemporaryDirectory(prefix='pp-cleanup-policy-') as name:
            root = Path(name)
            script = r'''set -euo pipefail
MODE=camera
primary_exit="$PP_TEST_PRIMARY_EXIT"
contacts_exit="$PP_TEST_CONTACTS_EXIT"
evidence="$PP_TEST_EVIDENCE"
subject=SYNTHETIC_NO_CHECKOUT
controller=SYNTHETIC_NO_CONTROLLER
metro_pid=""
mkdir -p "$evidence"
python3() { printf 'guest-media-collector\n' >> "$PP_TEST_LOG"; }
git() { printf 'local-source-metadata\n' >> "$PP_TEST_LOG"; }
''' + cleanup + '\ncleanup\n'
            env = dict(os.environ, PP_TEST_PRIMARY_EXIT=str(primary_exit),
                       PP_TEST_CONTACTS_EXIT=str(contacts_exit), PP_TEST_EVIDENCE=str(root / 'evidence'),
                       PP_TEST_LOG=str(root / 'calls.txt'))
            runner.subprocess.run(['bash', '-c', script], env=env, capture_output=True,
                                  text=True, timeout=5, check=True)
            calls = (root / 'calls.txt').read_text()
            excluded = root / 'evidence/cleanup-media-excluded.json'
            return calls, json.loads(excluded.read_text()) if excluded.exists() else None

    def test_cleanup_after_primary_unsafe_never_collects_guest_media(self):
        calls, excluded = self.run_cleanup_branch(2, 2)
        self.assertNotIn('guest-media-collector', calls)
        self.assertIn('local-source-metadata', calls)
        self.assertTrue(excluded['mediaExcluded'])
        self.assertFalse(excluded['guestCommandsPerformed'])

    def test_cleanup_after_contacts_unsafe_never_collects_guest_media(self):
        calls, excluded = self.run_cleanup_branch(1, 2)
        self.assertNotIn('guest-media-collector', calls)
        self.assertFalse(excluded['guestCommandsPerformed'])

    def test_cleanup_safe_failure_keeps_original_media_collection(self):
        calls, excluded = self.run_cleanup_branch(1, 1)
        self.assertIn('guest-media-collector', calls)
        self.assertIsNone(excluded)


if __name__ == '__main__':
    unittest.main()
