"""Adapt the strict observed Expo host tutorial handler to function collectors."""
import json
from pathlib import Path
import sys
import subprocess
import time
import xml.etree.ElementTree as ET

from expo_go_intro import intro_sheet, dismiss_observed_intro, PERMISSION_PACKAGES
from native_overlay import assert_no_native_error_overlay

sys.path.insert(0, str(Path(__file__).resolve().parent / 'camera'))
import camera_followup as selectors


def strict_action(tree, *args):
    assert_no_native_error_overlay(tree)
    return selectors.exact_action(tree, *args)


class ModuleIntro:
    def __init__(self, namespace):
        self.namespace = namespace
        self.output = namespace['ROOT']
        self.deadline = time.monotonic() + 600
        self.developer_sheet_dismissals = 0

    def adb(self, *args, **kwargs):
        if time.monotonic() >= self.deadline:
            raise RuntimeError('Bounded host-onboarding adapter exceeded 600 seconds')
        return self.namespace['adb'](*args, **kwargs)

    def dump(self):
        tree = self.namespace['dump']()
        assert_no_native_error_overlay(tree)
        return tree, ET.tostring(tree, encoding='unicode')

    def capture(self, name, required=(), action=None, allow_developer_sheet=False):
        if not allow_developer_sheet:
            raise RuntimeError('This adapter captures only explicitly named host onboarding, never product states')
        before, xml = self.dump()
        if any(n.get('package') in PERMISSION_PACKAGES for n in before.iter('node')):
            raise RuntimeError('Native permission overlay blocks Expo onboarding capture/action')
        if required and not intro_sheet(before):
            raise RuntimeError('Exact observed tutorial missing before host capture')
        if action:
            strict_action(before, *action)
        data = self.adb('exec-out', 'screencap', '-p', binary=True)
        after, after_xml = self.dump()
        if any(n.get('package') in PERMISSION_PACKAGES for n in after.iter('node')):
            raise RuntimeError('Native permission overlay appeared during host capture')
        if required and not intro_sheet(after):
            raise RuntimeError('Exact observed tutorial changed during host capture')
        if action:
            strict_action(after, *action)
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError('Actual host tutorial screenshot was not PNG')
        (self.output / (name + '.xml')).write_text(xml)
        (self.output / (name + '-after.xml')).write_text(after_xml)
        (self.output / (name + '.png')).write_bytes(data)
        return True

    def dismiss(self, tree):
        try:
            return dismiss_observed_intro(self, tree, strict_action, selectors.bounds)
        except (subprocess.SubprocessError, ET.ParseError) as error:
            # Primary's ordinary polling intentionally retries these types.
            # Once the exact tutorial is recognized, a failed action/capture
            # must fail the case instead of silently retrying without proof.
            raise RuntimeError('Recognized Expo tutorial transport/XML failed; no closure or product target claim') from error
