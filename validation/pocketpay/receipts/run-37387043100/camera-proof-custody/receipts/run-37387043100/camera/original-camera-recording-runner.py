"""Retain optional original camera guest clips; never substitutes UI or permission state."""
import json
import hashlib
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'camera'))
import camera_followup as collector
from native_overlay import assert_no_native_error_overlay
from expo_go_intro import intro_sheet, dismiss_observed_intro

last_controller = None

original_contains = collector.contains
original_action = collector.exact_action
original_developer_sheet = collector.developer_sheet


def known_developer_sheet(tree):
    return original_developer_sheet(tree) or intro_sheet(tree)


def guarded_contains(tree, label):
    assert_no_native_error_overlay(tree)
    return original_contains(tree, label)


def guarded_action(tree, *args, **kwargs):
    assert_no_native_error_overlay(tree)
    return original_action(tree, *args, **kwargs)



class RecordingController(collector.Controller):
    def __init__(self, serial, output, checkout, suite):
        global last_controller
        last_controller = self
        self.unsafe_stop = False
        self.recording = None
        try:
            super().__init__(serial, output, checkout, suite)
        except Exception:
            self.unsafe_stop = True
            raise
        self.source_checkout = Path(checkout)
        self.video_sequence = 0
        self.video_records = []
        self.send_exit = None
        self.original_contacts_callback_completed = False
        self.send_result = {'status': 'not_attempted', 'passed': False,
                            'reason': 'Requires successful actual Contacts unavailable case while the primary OS grant is still current'}

    def stop_unsafe(self):
        self.unsafe_stop = True
        if self.recording is not None:
            name, remote, process = self.recording
            self.recording = None
            # Stop only the owned local recorder connection. No guest command,
            # pull, raw stderr or original video is retained after unsafe UI.
            try:
                process.terminate()
                process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate(timeout=5)
            self.video_records.append({'name': name, 'excluded': True,
                'reason': 'Unsafe media/environment observed; owned recorder stopped without video pull or further guest commands'})
            (self.output / 'original-camera-recordings.json').write_text(json.dumps(self.video_records, indent=2) + '\n')

    def adb(self, *args, **kwargs):
        if self.unsafe_stop:
            raise collector.UnsafeMedia('Unsafe camera condition blocks further guest commands')
        try:
            return super().adb(*args, **kwargs)
        except (subprocess.SubprocessError, OSError):
            self.stop_unsafe()
            raise

    def dump(self):
        try:
            tree, xml = super().dump()
            assert_no_native_error_overlay(tree)
            return tree, xml
        except (collector.UnsafeMedia, RuntimeError, subprocess.SubprocessError, OSError, ValueError, ET.ParseError):
            self.stop_unsafe()
            raise

    def finish_recording(self):
        if self.unsafe_stop:
            self.stop_unsafe()
            return
        if self.recording is None:
            return
        name, remote, process = self.recording
        self.recording = None
        result = {'name': name, 'visibleLoadingClaim': 'Independent original-frame review required'}
        try:
            remaining = min(self.deadline, getattr(self, 'recording_deadline', time.monotonic() + 25)) - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired('owned original recorder', 0)
            _, stderr = process.communicate(timeout=remaining)
            result.update({'exit': process.returncode, 'stderr': stderr.decode('utf-8', 'replace')})
            if process.returncode == 0:
                self.adb('pull', remote, str(self.output / (name + '-original.mp4')))
        except subprocess.TimeoutExpired:
            process.terminate()
            process.communicate(timeout=5)
            result['error'] = 'Recorder exceeded its optional metadata bound; no loading claim'
        except Exception as error:
            result['error'] = str(error)
        finally:
            if not self.unsafe_stop:
                subprocess.run(['adb', '-s', self.serial, 'shell', 'rm', '-f', remote],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               timeout=12, check=False)
            else:
                # An interrupted pull may have left partial local media. Exclude
                # it without any further guest command or raw stderr retention.
                (self.output / (name + '-original.mp4')).unlink(missing_ok=True)
                result = {'name': name, 'excluded': True,
                          'reason': 'Unsafe recorder transfer; no video retained or further guest cleanup performed'}
            self.video_records.append(result)
            (self.output / 'original-camera-recordings.json').write_text(json.dumps(self.video_records, indent=2) + '\n')

    def begin_recording(self, kind, seconds):
        if self.unsafe_stop:
            raise collector.UnsafeMedia('Unsafe condition blocks starting a recorder')
        self.finish_recording()
        if self.unsafe_stop:
            raise collector.UnsafeMedia('Unsafe prior recorder condition blocks starting another recorder')
        self.video_sequence += 1
        name = self.suite + '-' + kind + '-' + str(self.video_sequence)
        remote = '/sdcard/' + name + '.mp4'
        process = subprocess.Popen(['adb', '-s', self.serial, 'shell', 'screenrecord',
                                    '--size', '720x1280', '--bit-rate', '800000',
                                    '--time-limit', str(seconds), remote],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        self.recording = (name, remote, process)
        # Permit the actual prescribed clip to complete, with five seconds of
        # collection margin, still inside the original 600-second suite bound.
        self.recording_deadline = time.monotonic() + seconds + 5

    def launch(self, screen):
        # These prescribed missing-wallet Scan/Contacts routes have no secret UI.
        # First Scan clip spans real Expo startup; later frames are warm app state.
        if screen == 'scan':
            self.begin_recording('scan-launch', 60)
        return super().launch(screen)

    def wait(self, text, seconds=35, scope=None):
        # Keep the original target/permission/loading rules and bounds. Only
        # the concretely observed Expo host tutorial is an added branch.
        until = min(self.deadline, time.monotonic() + seconds)
        while time.monotonic() < until:
            tree, _ = self.dump()
            if intro_sheet(tree):
                dismiss_observed_intro(self, tree, guarded_action, collector.bounds)
                continue
            if original_developer_sheet(tree):
                if self.developer_sheet_dismissals >= 2:
                    raise RuntimeError('Expo developer sheet exceeded bounded observed dismissals')
                name = 'observed-expo-dev-sheet-' + str(self.developer_sheet_dismissals + 1)
                if self.capture(name, ('SDK Version', 'Connected to expo-cli'), allow_developer_sheet=True):
                    current, _ = self.dump()
                    if original_developer_sheet(current):
                        self.developer_sheet_dismissals += 1
                        self.adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
                continue
            if self.reject_post_denial_prompt and collector.permission_prompt(tree):
                self.unexpected_prompt()
            if collector.permission_prompt(tree):
                raise RuntimeError('Native permission dialog blocks product/loading acceptance')
            if scope and not self.loading[scope] and guarded_contains(tree, collector.LOADING):
                name = scope + '-actual-permission-loading'
                if self.capture(name, (collector.LOADING, collector.MANUAL)):
                    self.loading[scope].append(name)
            if guarded_contains(tree, text):
                return tree
            time.sleep(0.2)
        raise RuntimeError('Actual UI state not observed within bound: ' + text)

    def tap(self, tree, label, packages=None, resource_suffix=None):
        if label == 'Scan QR code to add contact':
            # The actual parent selector remains strict and verifies the observed
            # visible action; no component, hook response or timing is replaced.
            self.begin_recording('contacts-scan', 8)
        return super().tap(tree, label, packages, resource_suffix)

    def contacts_unavailable_manual(self):
        # Preserve the original Contacts callback/result. The separate actual
        # /send measurement runs while its observed real OS grant is still live,
        # before either user-fixed case revokes that permission.
        super().contacts_unavailable_manual()
        self.original_contacts_callback_completed = True
        self.finish_recording()
        if self.unsafe_stop:
            self.send_exit = 2
            self.send_result = {'status': 'blocked_unattempted', 'passed': False,
                'exitCode': 2, 'safeToAttemptNextIndependentCase': False,
                'failure': 'Unsafe Contacts recording transfer; Send subprocess and guest actions were not attempted'}
            raise collector.UnsafeMedia('Unsafe Contacts recorder condition blocks launching Send')
        send_output = self.output.parent / 'send-preservation'
        try:
            fresh = self.output / 'guest-only-fresh-data-reset.txt'
            permission = self.output / 'contacts-unavailable-native-permission.txt'
            if fresh.read_text().strip() != 'Success' or 'granted=true' not in permission.read_text():
                raise RuntimeError('Actual fresh guest/current grant prerequisite is missing')
            grant_files = [self.output / 'scan-actual-os-grant-dialog.xml',
                           self.output / 'scan-actual-os-grant-dialog.png', permission]
            evidence = [{'path': str(path.resolve()),
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                        for path in grant_files]
            receipt = self.output / 'send-owner-prerequisite.json'
            receipt.write_text(json.dumps({
                'exclusiveDisposableEmulator': True,
                'freshGuestContainsNoUserWallet': True,
                'actualOsCameraGrantObserved': True,
                'frontAndBackCameraHardwareAbsent': True,
                'stellarNetwork': 'TESTNET',
                'sourceSha': collector.SOURCE_SHA, 'serial': self.serial,
                'actualOsGrantEvidence': evidence,
                'freshDataResetEvidence': {'path': str(fresh.resolve()),
                    'sha256': hashlib.sha256(fresh.read_bytes()).hexdigest()},
                'limit': 'Primary actual grant tap and Contacts callback have completed; Send independently rechecks current native grant, zero camera devices and exact source.'
            }, indent=2) + '\n')
            runner = Path(__file__).resolve().parent / 'send' / 'send_preservation.py'
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError('No primary controller time remains for Send')
            with (self.output / 'send-controller.stdout.txt').open('w') as stdout, \
                 (self.output / 'send-controller.stderr.txt').open('w') as stderr:
                process = subprocess.run([sys.executable, str(runner), '--serial', self.serial,
                    '--source-checkout', str(self.source_checkout),
                    '--owner-prerequisite-receipt', str(receipt),
                    '--artifacts', str(send_output)], stdout=stdout, stderr=stderr,
                    timeout=min(330, remaining), check=False)
            report = json.loads((send_output / 'observations.json').read_text())
            if process.returncode not in (0, 1, 2) or report.get('exitCode') != process.returncode:
                raise RuntimeError('Send controller exit/report integrity differs')
            if process.returncode == 0 and report.get('passed') is not True:
                raise RuntimeError('Send successful exit lacks actual passed report')
            if report.get('safeToAttemptNextIndependentCase') is not (process.returncode != 2):
                raise RuntimeError('Send independent-case safety convention differs')
            self.send_exit, self.send_result = process.returncode, report
            if self.send_exit == 2:
                self.stop_unsafe()
        except Exception:
            # No guessed receipt, raw error/media capture or continuation after
            # an unknown/unsafe controller failure. Existing actual files stay.
            self.send_exit = 2
            self.stop_unsafe()
            self.send_result = {'status': 'blocked_unsafe_environment', 'passed': False,
                'exitCode': 2, 'safeToAttemptNextIndependentCase': False,
                'failure': 'Send prerequisite/controller integrity failed; remaining cases blocked without further actions'}

    def user_fixed_manual(self):
        if self.send_exit == 2:
            raise collector.UnsafeMedia('Send unsafe result blocks this unattempted independent case')
        # An ordinary Send observation failure may continue only through this
        # existing independent force-stop/revoke reset, never in its live form.
        return super().user_fixed_manual()

    def run(self):
        try:
            measured_exit = super().run()
            # Include the final owned transfer in the safety/exit decision, so
            # a late pull failure cannot leave a successful aggregate report.
            self.finish_recording()
            if self.suite == 'primary-and-user-fixed':
                self.report['originalCameraCasesPassed'] = self.report['passed']
                self.report['originalContactsCallbackCompleted'] = self.original_contacts_callback_completed
                if self.original_contacts_callback_completed:
                    for item in self.report['cases']:
                        if item['name'] == 'contacts-unavailable-manual' and item['result'] != 'passed':
                            item['postCallbackIntegrationFailure'] = item.pop('error', 'Send integration blocked')
                            item['result'] = 'passed'
                self.report['sendPreservation'] = self.send_result
                self.report['sendExit'] = self.send_exit
                self.report['sendIntegrationOrder'] = 'after original Contacts unavailable/manual callback, before user-fixed permission reset'
                if self.send_exit == 2:
                    blocked = ('scan-user-fixed-manual', 'contacts-user-fixed-manual')
                    by_name = {item['name']: item for item in self.report['cases']}
                    for name in blocked:
                        if name in by_name:
                            by_name[name].update({'result': 'blocked_unattempted',
                                'error': 'No actions: unsafe Send condition'})
                        else:
                            self.report['cases'].append({'name': name,
                                'result': 'blocked_unattempted', 'error': 'No actions: unsafe Send condition'})
                    self.report['safeToAttemptNextIndependentCase'] = False
                self.report['passed'] = measured_exit == 0 and self.send_exit == 0 and not self.unsafe_stop
                (self.output / 'observations.json').write_text(json.dumps(self.report, indent=2) + '\n')
            if self.unsafe_stop:
                expected = ('contacts-ordinary-first-denial-manual',) if self.suite == 'contacts-first-denial' else (
                    'scan-denied-manual', 'scan-unavailable-manual', 'contacts-unavailable-manual',
                    'scan-user-fixed-manual', 'contacts-user-fixed-manual')
                observed = {item['name'] for item in self.report['cases']}
                for name in expected:
                    if name not in observed:
                        self.report['cases'].append({'name': name, 'result': 'blocked_unattempted',
                            'error': 'No actions: unsafe camera/Send condition'})
                self.report.update({'passed': False, 'safeToAttemptNextIndependentCase': False,
                                    'unsafeStop': True, 'exitCode': 2})
                (self.output / 'observations.json').write_text(json.dumps(self.report, indent=2) + '\n')
                return 2
            return (0 if self.report['passed'] else 1) if self.suite == 'primary-and-user-fixed' else measured_exit
        except Exception:
            self.stop_unsafe()
            raise
        finally:
            self.finish_recording()


if __name__ == '__main__':
    collector.contains = guarded_contains
    collector.exact_action = guarded_action
    collector.developer_sheet = known_developer_sheet
    collector.Controller = RecordingController
    result = collector.main()
    if last_controller is not None and last_controller.unsafe_stop:
        result = 2
    # The immutable CLI records constructor/guest/source/cache precondition
    # exceptions as exit1. Upgrade that precondition metadata without taking
    # media or touching a guest; case observation failures still retain exit1.
    if '--artifacts' in sys.argv:
        output = Path(sys.argv[sys.argv.index('--artifacts') + 1])
        error_path = output / 'precondition-error.json'
        if error_path.exists():
            data = json.loads(error_path.read_text())
            data.update({'exitCode': 2, 'safeToAttemptNextIndependentCase': False,
                         'unsafeStop': True})
            error_path.write_text(json.dumps(data, indent=2) + '\n')
            result = 2
    raise SystemExit(result)
