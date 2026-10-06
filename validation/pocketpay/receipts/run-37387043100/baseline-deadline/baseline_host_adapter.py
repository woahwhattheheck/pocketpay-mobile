"""Strict host-only settling for the existing baseline collector.

No URI delivery, fixture initialization, product callback or counter repair.
Raw callbacks are captured before wrapping; host proof never settles itself.
"""
import json
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

from baseline_observer_framing import decode_observer_line
from baseline_startup_overlay import FatalFixtureStartup, fixture_startup_error
from expo_go_intro import intro_sheet, dismiss_observed_intro

PREFIXES = ('POCKETPAY_BASELINE_NATIVE_FIXTURE', 'POCKETPAY_VAULT_NATIVE_FIXTURE')


class BaselineHostAdapter:
    def __init__(self, namespace, *, host=None, action=None, bounds=None):
        if host is None:
            import expo_ordinary_menu as host
        if action is None or bounds is None:
            from expo_go_module_intro import strict_action, selectors
            action = action or strict_action
            bounds = bounds or selectors.bounds
        self.namespace = namespace
        self.host, self.action, self.bounds = host, action, bounds
        self.raw_dump, self.raw_adb = namespace['dump'], namespace['adb']
        self.raw_tap_node = namespace['tap_node']
        self.raw_case = namespace['case']
        self.output = Path(namespace['ROOT'])
        # One collector-wide bound. Independent cases never extend this clock.
        self.deadline = time.monotonic() + 600
        self.developer_sheet_dismissals = 0
        self.closures = 0
        self._observer_samples = 0
        self._settling = False

    def _remaining(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('Baseline host adapter exceeded its global 600-second bound')
        return remaining

    def adb(self, *args, **kwargs):
        remaining = self._remaining()
        kwargs['timeout'] = min(kwargs.get('timeout', 30), remaining)
        try:
            result = self.raw_adb(*args, **kwargs)
        except subprocess.SubprocessError as error:
            if time.monotonic() >= self.deadline:
                raise RuntimeError('Baseline ADB reached its original global 600-second bound') from error
            raise
        self._remaining()
        return result

    def bounded_raw_dump(self, name='current'):
        self._remaining()
        tree = self.raw_dump(name)
        self._remaining()
        return tree

    def dump(self, name='current'):
        tree = self.bounded_raw_dump(name)
        if fixture_startup_error(tree):
            raise FatalFixtureStartup('Actual runtime-not-ready initializer error; no host or product action')
        # Original raw dump already rejects secret material before retention.
        self.host.overlay_guard(tree)
        self._remaining()
        return tree, ET.tostring(tree, encoding='unicode')

    @staticmethod
    def _markers(tree, required):
        values = {n.get('text', '').strip() for n in tree.iter('node')
                  if n.get('package') == 'host.exp.exponent'}
        if not set(required).issubset(values):
            raise RuntimeError('Host proof lost its exact required markers')

    def capture(self, name, required=(), action=None, allow_developer_sheet=False):
        """Shared helper proof only, using raw guarded dumps without recursion."""
        before, xml = self.dump()
        if not allow_developer_sheet:
            self.host.unobscured_host(before)
        self._markers(before, required)
        if action:
            self.action(before, *action)
        data = self.adb('exec-out', 'screencap', '-p', binary=True)
        after, after_xml = self.dump()
        if not allow_developer_sheet:
            self.host.unobscured_host(after)
        self._markers(after, required)
        if action:
            self.action(after, *action)
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError('Host proof was not an actual PNG')
        self._remaining()
        (self.output / (name + '.xml')).write_text(xml)
        (self.output / (name + '-after.xml')).write_text(after_xml)
        (self.output / (name + '.png')).write_bytes(data)
        return True

    def _pid(self):
        pid = self.adb('shell', 'pidof', 'host.exp.exponent').strip()
        if not re.fullmatch(r'[1-9][0-9]*', pid):
            raise RuntimeError('Unique existing Expo process not established')
        return pid

    def _records(self):
        rows = {prefix: [] for prefix in PREFIXES}
        pid = self._pid()
        command = ('logcat', '-d', '-s', 'ReactNativeJS:I', '--pid=' + pid)
        self._observer_samples += 1
        stem = 'baseline-native-observer-pid-' + str(self._observer_samples).zfill(4)
        (self.output / (stem + '.json')).write_text(json.dumps({
            'command': ['adb', *command], 'pidBefore': pid, 'pidAfter': None,
            'samePidVerified': False, 'queryStatus': 'started',
        }, indent=2) + '\n')
        raw = self.adb(*command, timeout=30)
        self.host.retain_native_text(self, stem + '.log', raw)
        after_pid = self._pid()
        (self.output / (stem + '.json')).write_text(json.dumps({
            'command': ['adb', *command], 'pidBefore': pid, 'pidAfter': after_pid,
            'samePidVerified': pid == after_pid, 'rawOutputFile': stem + '.log', 'queryStatus': 'completed',
        }, indent=2) + '\n')
        if after_pid != pid:
            raise RuntimeError('Baseline native observer process changed during PID-scoped read')
        for line in raw.splitlines():
            for prefix in PREFIXES:
                if prefix not in line:
                    continue
                row = decode_observer_line(line, prefix)
                if row is None:
                    raise RuntimeError('Malformed current baseline observer record')
                if prefix == PREFIXES[0]:
                    transport = row.get('transport', {})
                    counts = row.get('counters', {})
                    if not isinstance(counts, dict) or not isinstance(transport, dict):
                        raise RuntimeError('Actual baseline safety fields are missing')
                    if any(counts.get(k) != 0 for k in ('walletSaveAttempts', 'backupAttempts', 'clipboardAttempts')):
                        raise RuntimeError('Missing/nonzero baseline write counter during host handling')
                else:
                    transport = row
                if any(transport.get(k) != 0 for k in ('secretAccess', 'broadcastAttempts', 'deposit', 'withdraw')):
                    raise RuntimeError('Missing/nonzero transport safety counter during host handling')
                rows[prefix].append(row)
        return rows

    @staticmethod
    def _preserved(before, after):
        for prefix in PREFIXES:
            if after[prefix][:len(before[prefix])] != before[prefix]:
                raise RuntimeError('Baseline native record history changed or was cleared during host closure')
            # First initialization may complete while the host is being closed.
            # Once observed, a repeated bootstrap implies a fixture reset.
            bootstraps = {'bootstrap-ready', 'baseline-bootstrap-ready'}
            initialized = any(row.get('event') in bootstraps or row.get('ready') is True
                              for row in before[prefix])
            if initialized and any(row.get('event') in bootstraps
                                   for row in after[prefix][len(before[prefix]):]):
                raise RuntimeError('Baseline fixture reinitialized during host closure')

    def uncovered(self, name='current'):
        if self._settling:
            raise RuntimeError('Recursive baseline host settling is forbidden')
        tree, _ = self.dump(name)
        if intro_sheet(tree) or self.host.has_host_sheet(tree):
            self._settling = True
            try:
                pid, before = self._pid(), self._records()
                if intro_sheet(tree):
                    dismiss_observed_intro(self, tree, self.action, self.bounds)
                tree, _ = self.dump(name)
                if self.host.has_host_sheet(tree):
                    self.host.close_ordinary_menu(self)
                tree, _ = self.dump(name)
                self.host.unobscured_host(tree)
                if self._pid() != pid:
                    raise RuntimeError('Baseline host action replaced the existing Expo process')
                after = self._records()
                self._preserved(before, after)
                self.closures += 1
                (self.output / 'baseline-host-state-preservation.json').write_text(json.dumps({
                    'closureCount': self.closures, 'pid': pid,
                    'globalDeadlineReset': False, 'originalNativeHistoryPreserved': True,
                    'fixtureStateSeeded': False, 'uriDelivered': False,
                    'productStatePassed': False,
                    'prefixRecordCounts': {p: [len(before[p]), len(after[p])] for p in PREFIXES},
                }, indent=2) + '\n')
            except (subprocess.SubprocessError, ET.ParseError) as error:
                # Original ordinary wait retries these types. A recognized
                # host action/capture failure must instead fail the case.
                raise RuntimeError('Recognized baseline host transport/XML failed; no closure claim') from error
            finally:
                self._settling = False
        if intro_sheet(tree) or self.host.has_host_sheet(tree):
            raise RuntimeError('Expo host still covers baseline product UI')
        self._remaining()
        return tree

    def product_capture(self, name, allow_expo_sheet=False):
        failure = self.namespace['failure_capture'](name)
        if failure:
            # Preserve the actual failed hierarchy without a recovery action.
            tree = self.bounded_raw_dump()
        else:
            tree = self.uncovered()
        xml = ET.tostring(tree, encoding='unicode')
        if not failure and self.namespace['native_error'](tree):
            raise RuntimeError('Actual native error covers baseline product capture')
        data = self.adb('exec-out', 'screencap', '-p', binary=True)
        after = self.bounded_raw_dump()
        if not failure:
            self.host.overlay_guard(after)
            if intro_sheet(after) or self.host.has_host_sheet(after):
                raise RuntimeError('Late host overlay covers PNG; no product image retained')
            if self.namespace['native_error'](after):
                raise RuntimeError('Actual native error covers product PNG; no image retained')
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError('ADB did not return a PNG')
        self._remaining()
        (self.output / (name + '.xml')).write_text(xml)
        (self.output / (name + '-media-guard.xml')).write_text(ET.tostring(after, encoding='unicode'))
        (self.output / (name + '.png')).write_bytes(data)
        return tree

    def product_tap_node(self, node):
        # Never act on a stale bound after host settling. The exact previously
        # selected element must be uniquely present in a fresh uncovered dump.
        tree = self.uncovered()
        keys = ('class', 'package', 'text', 'content-desc', 'resource-id', 'bounds', 'enabled', 'clickable')
        matches = [n for n in tree.iter('node')
                   if all(n.get(k, '') == node.get(k, '') for k in keys)]
        if len(matches) != 1:
            raise RuntimeError('Previously selected native action changed or became ambiguous after host settling')
        fresh = matches[0]
        self.host.enabled_chain(tree, fresh)
        if fresh.get('enabled') != 'true' or fresh.get('clickable') != 'true':
            raise RuntimeError('Refreshed native action is not enabled and clickable')
        self.host.visible_bounds(fresh)
        self._remaining()
        self.raw_tap_node(fresh)
        self._remaining()

    def bounded_case(self, name, callback):
        if time.monotonic() >= self.deadline:
            self.namespace['REPORT']['cases'].append({
                'name': name, 'result': 'blocked_unattempted',
                'reason': 'Original global 600-second native bound expired; no callback or guest action attempted',
            })
            (self.output / 'observations.json').write_text(json.dumps(self.namespace['REPORT'], indent=2))
            return
        def bounded_callback():
            self._remaining()
            callback()
            self._remaining()
        return self.raw_case(name, bounded_callback)


def install(namespace, **options):
    adapter = BaselineHostAdapter(namespace, **options)
    namespace['dump'] = adapter.uncovered
    namespace['capture'] = adapter.product_capture
    namespace['tap_node'] = adapter.product_tap_node
    namespace['adb'] = adapter.adb
    namespace['case'] = adapter.bounded_case
    # The legacy Back branch must never match uncovered product polling.
    # Late/unknown host UI fails closed through dump, action and capture guards.
    namespace['expo_sheet'] = lambda tree: intro_sheet(tree) or adapter.host.has_host_sheet(tree)
    namespace['BASELINE_HOST_ADAPTER'] = adapter
    return adapter
