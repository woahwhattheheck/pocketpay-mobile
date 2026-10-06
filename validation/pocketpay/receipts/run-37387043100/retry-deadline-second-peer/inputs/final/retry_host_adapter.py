"""Controller-only host settling; never launches or resets a Retry fixture.

Raw callbacks are bound before installation. Host proof is separate from the
fresh product target and from the immutable payment-outcome validators.
"""
import json
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

from observer_framing import decode_observer_line
from expo_go_intro import intro_sheet, dismiss_observed_intro
from native_overlay import assert_no_native_error_overlay

SOURCE = 'ddd56649099d1fc5763ef29af3bfba0363897bd6'
PREFIXES = {
    'primary': 'POCKETPAY_RETRY_PRIMARY_NATIVE_OBSERVER',
    'gap': 'POCKETPAY_RETRY_GAP_NATIVE_OBSERVER',
}


class RetryBoundExpired(RuntimeError):
    """No further guest commands after the original collector bound."""


class RetryHostAdapter:
    def __init__(self, namespace, kind, *, host=None, intro_action=None, intro_bounds=None):
        if kind not in PREFIXES:
            raise ValueError('Unknown Retry observer kind')
        if host is None:
            import expo_ordinary_menu as host
        if intro_action is None:
            from expo_go_module_intro import strict_action as intro_action
        if intro_bounds is None:
            from expo_go_module_intro import selectors
            intro_bounds = selectors.bounds
        self.host = host
        self.intro_action = intro_action
        self.intro_bounds = intro_bounds
        self.raw_dump = namespace['dump']
        self.raw_adb = namespace['adb']
        self.expired_type = namespace.get('UnsafeEnvironment', RetryBoundExpired)
        self.output = Path(namespace['ROOT'])
        self.deadline = time.monotonic() + 600
        self.developer_sheet_dismissals = 0
        self.kind = kind
        self.outcome = None
        self.stable = False
        self.expected = ()
        self.closures = 0
        self._settling = False

    def begin_case(self, outcome):
        # Only the original independent-case launch resets these observations.
        # This method contains no guest command and is never called by settling.
        self.require_live()
        self.outcome = outcome
        self.stable = False
        self.expected = ()

    def adb(self, *args, **kwargs):
        self.require_live()
        # Both actual frozen raw ADB functions accept a subprocess timeout.
        # Preserve their default bounds while clipping to this same clock.
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            self.require_live()
        options = dict(kwargs)
        default_timeout = 30 if self.kind == 'primary' else 25
        options['timeout'] = min(options.get('timeout', default_timeout), remaining)
        try:
            result = self.raw_adb(*args, **options)
        except subprocess.SubprocessError:
            self.require_live()
            raise
        self.require_live()
        return result

    def require_live(self):
        if time.monotonic() >= self.deadline:
            raise self.expired_type('Retry collector exceeded its original global 600-second bound; no further guest command permitted')

    def dump(self):
        # Shared host helpers must receive this bound raw callback, not the
        # product wait/capture wrapper, or they would recursively settle.
        self.require_live()
        tree = self.raw_dump()
        self.require_live()
        assert_no_native_error_overlay(tree)
        return tree, ET.tostring(tree, encoding='unicode')

    def capture(self, name, required=(), action=None, allow_developer_sheet=False):
        # Only shared host proof calls this method. It cannot settle itself.
        before, xml = self.dump()
        self.host.overlay_guard(before)
        if not allow_developer_sheet:
            self.host.unobscured_host(before)
        self._require_markers(before, required)
        if action:
            self.intro_action(before, *action)
        data = self.adb('exec-out', 'screencap', '-p', binary=True)
        after, after_xml = self.dump()
        self.host.overlay_guard(after)
        if not allow_developer_sheet:
            self.host.unobscured_host(after)
        self._require_markers(after, required)
        if action:
            self.intro_action(after, *action)
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError('Host proof was not an actual PNG')
        (self.output / (name + '.xml')).write_text(xml)
        (self.output / (name + '-after.xml')).write_text(after_xml)
        (self.output / (name + '.png')).write_bytes(data)
        return True

    @staticmethod
    def _require_markers(tree, required):
        labels = {node.get('text', '').strip() for node in tree.iter('node')
                  if node.get('package') == 'host.exp.exponent'}
        if not set(required).issubset(labels):
            raise RuntimeError('Host capture lost its exact required markers')

    def _records(self):
        if self.outcome is None:
            raise RuntimeError('Retry case outcome was not bound before host handling')
        prefix = PREFIXES[self.kind]
        records = []
        for line in self.adb('logcat', '-d', '-s', 'ReactNativeJS:I').splitlines():
            if prefix not in line:
                continue
            record = decode_observer_line(line, prefix)
            if record is None:
                raise RuntimeError('Malformed current Retry observer record; absence is not assumed')
            if record.get('sourceSha') != SOURCE:
                raise RuntimeError('Retry host observer source changed')
            # The primary observer initially emits its default unknown outcome
            # before the original route selects this independent case.
            if record.get('outcome') != self.outcome:
                if not (self.kind == 'primary' and record.get('event') == 'primary-observer-ready' and record.get('outcome') == 'unknown'):
                    raise RuntimeError('Retry observer outcome changed across host handling')
            counts = record.get('counters')
            if not isinstance(counts, dict):
                raise RuntimeError('Retry host observer counters missing')
            forbidden = ('broadcastAttempts', 'rpcWrites', 'walletSaveAttempts')
            if self.kind == 'gap':
                forbidden += ('secretCalls', 'signingCalls', 'submitCalls', 'unknownClears')
            if any(counts.get(key) != 0 for key in forbidden):
                raise RuntimeError('Nonzero/missing Retry host safety counter')
            if self.kind == 'primary' and record.get('event') == 'primary-observer-ready':
                if any(value != 0 for value in counts.values()) or record.get('submitCalls') != 0 or record.get('readCalls') != 0 or record.get('transactionHash') is not None or record.get('unknownPresent') is not False:
                    raise RuntimeError('Primary bootstrap ready record contains payment activity')
            records.append(record)
        if self.stable and not records:
            raise RuntimeError('Stable Retry case lost its actual observer records')
        return records

    def _pid(self):
        value = self.adb('shell', 'pidof', 'host.exp.exponent').strip()
        if not re.fullmatch(r'[1-9][0-9]*', value):
            raise RuntimeError('Unique existing Expo process not established')
        return value

    @staticmethod
    def _same_state(before, after):
        return {key: value for key, value in before.items() if key != 'event'} == {
            key: value for key, value in after.items() if key != 'event'}

    def _preserved(self, before, after):
        if after[:len(before)] != before:
            raise RuntimeError('Retry native history changed or was cleared during host closure')
        appended = after[len(before):]
        if (before or self.stable) and any(row.get('event') in ('primary-observer-ready', 'retry-gap-observer-ready') for row in appended):
            raise RuntimeError('Retry fixture observer reinitialized during host closure')
        if not before and after:
            for row in after:
                counts = row['counters']
                keys = ('submitObserved', 'readObserved', 'secretCalls', 'signingCalls') if self.kind == 'primary' else ('readCalls', 'readCompleted', 'mismatchResponses', 'readErrors')
                if any(counts.get(key) != 0 for key in keys):
                    raise RuntimeError('Initial host closure performed a payment operation')
        if before and (not after or any(not self._same_state(before[-1], row) for row in appended)):
            # Deliberately fail an ambiguous in-flight transition. The adapter
            # does not synthesize progress, replay a route, or relax validators.
            raise RuntimeError('Retry payment identity/counters changed while closing host chrome')
        if before and any(row.get('event') in ('real-signer-store-change', 'signer-store-observed') for row in appended):
            # Primary Review can reset/reseed an active review while all public
            # unknown fields remain null. Do not infer unchanged review custody
            # from identical latest visible fields in that unobserved interval.
            raise RuntimeError('Retry signer state changed during host closure; reset cannot be excluded')

    def uncovered(self, required=(), *, accept=False):
        self.require_live()
        if self._settling:
            raise RuntimeError('Recursive Retry host settling is forbidden')
        tree, _ = self.dump()
        self.host.overlay_guard(tree)
        if intro_sheet(tree) or self.host.has_host_sheet(tree):
            self._settling = True
            try:
                pid = self._pid()
                before = self._records()
                if intro_sheet(tree):
                    dismiss_observed_intro(self, tree, self.intro_action, self.intro_bounds)
                tree, _ = self.dump()
                self.host.overlay_guard(tree)
                if self.host.has_host_sheet(tree):
                    self.host.close_ordinary_menu(self)
                tree, _ = self.dump()
                self.host.unobscured_host(tree)
                if self._pid() != pid:
                    raise RuntimeError('Expo process changed during Retry host closure')
                after = self._records()
                self._preserved(before, after)
                self.closures += 1
                record = {'kind': self.kind, 'outcome': self.outcome, 'pid': pid,
                          'beforeRecords': before, 'afterRecords': after,
                          'productStatePassed': False, 'originalUriRedelivered': False}
                (self.output / ('retry-host-preservation-' + str(self.closures) + '.json')).write_text(json.dumps(record, indent=2)+'\n')
            except (subprocess.SubprocessError, ET.ParseError) as error:
                raise RuntimeError('Recognized Retry host handling failed; no target claim') from error
            finally:
                self._settling = False
        # The caller's target is checked against this fresh hierarchy; hidden
        # labels from the original wait or host before-proof cannot qualify it.
        self.host.overlay_guard(tree)
        if intro_sheet(tree) or self.host.has_host_sheet(tree):
            raise RuntimeError('Retry target is still covered by host chrome')
        self.require_live()
        if required:
            labels = [(node.get('text', '')+' '+node.get('content-desc', '')).casefold()
                      for node in tree.iter('node')]
            if not any(target.casefold() in value for target in required for value in labels):
                raise RuntimeError('Fresh uncovered Retry target was not observed: '+repr(required))
        if accept:
            self.require_live()
            self.stable = True
            self.expected = tuple(required)
        return tree

    def before_capture(self, required=()):
        return self.uncovered(required or self.expected)

    def before_action(self, label):
        # A successful native action remains owned by the original collector.
        # Settling never sends that action, signs, reads, launches or force-stops.
        return self.uncovered()

    def action_completed(self):
        self.expected = ()
