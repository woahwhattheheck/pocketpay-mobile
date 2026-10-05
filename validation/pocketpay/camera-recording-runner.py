"""Retain optional original camera guest clips; never substitutes UI or permission state."""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'camera'))
import camera_followup as collector
from native_overlay import assert_no_native_error_overlay

original_contains = collector.contains
original_action = collector.exact_action


def guarded_contains(tree, label):
    assert_no_native_error_overlay(tree)
    return original_contains(tree, label)


def guarded_action(tree, *args, **kwargs):
    assert_no_native_error_overlay(tree)
    return original_action(tree, *args, **kwargs)



class RecordingController(collector.Controller):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.recording = None
        self.video_sequence = 0
        self.video_records = []

    def finish_recording(self):
        if self.recording is None:
            return
        name, remote, process = self.recording
        self.recording = None
        result = {'name': name, 'visibleLoadingClaim': 'Independent original-frame review required'}
        try:
            _, stderr = process.communicate(timeout=25)
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
            subprocess.run(['adb', '-s', self.serial, 'shell', 'rm', '-f', remote],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=12, check=False)
            self.video_records.append(result)
            (self.output / 'original-camera-recordings.json').write_text(json.dumps(self.video_records, indent=2) + '\n')

    def begin_recording(self, kind, seconds):
        self.finish_recording()
        self.video_sequence += 1
        name = self.suite + '-' + kind + '-' + str(self.video_sequence)
        remote = '/sdcard/' + name + '.mp4'
        process = subprocess.Popen(['adb', '-s', self.serial, 'shell', 'screenrecord',
                                    '--size', '720x1280', '--bit-rate', '800000',
                                    '--time-limit', str(seconds), remote],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        self.recording = (name, remote, process)

    def launch(self, screen):
        # These prescribed missing-wallet Scan/Contacts routes have no secret UI.
        # First Scan clip spans real Expo startup; later frames are warm app state.
        if screen == 'scan':
            self.begin_recording('scan-launch', 20)
        return super().launch(screen)

    def tap(self, tree, label, packages=None, resource_suffix=None):
        if label == 'Scan QR code to add contact':
            # The actual parent selector remains strict and verifies the observed
            # visible action; no component, hook response or timing is replaced.
            self.begin_recording('contacts-scan', 8)
        return super().tap(tree, label, packages, resource_suffix)

    def run(self):
        try:
            return super().run()
        finally:
            self.finish_recording()


if __name__ == '__main__':
    collector.contains = guarded_contains
    collector.exact_action = guarded_action
    collector.Controller = RecordingController
    raise SystemExit(collector.main())
