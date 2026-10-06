"""Once-only first-History URI delivery before any product proof or action.

The native launch and fixture remain owned by the original collector. This
carrier is conditional on actual current logs and host/activity evidence;
its proof never qualifies a History state.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import time
import xml.etree.ElementTree as ET

SOURCE = '52ce8006a2d091a4c9f29852a1a530750ff9b3cc'
TREE = 'b7556026e93c5930915d12fdf51d421773c5f61e'
ROUTE = 'send/__baseline-native-fixture?case=history'
URI = 'exp://127.0.0.1:8081/--/' + ROUTE
CASE = 'history-same-instance-transition'
BASELINE = 'POCKETPAY_BASELINE_NATIVE_FIXTURE'
VAULT = 'POCKETPAY_VAULT_NATIVE_FIXTURE'
COUNTERS = ('generateKeypair', 'walletSaveAttempts', 'backupAttempts', 'clipboardAttempts',
            'historyMounts', 'historyUnmounts', 'historyHydrations', 'historyRemovals',
            'historyRefreshes', 'shareCalls', 'shareStringPayload', 'shareRedactedPayload',
            'shareSheetReturns', 'diagnosticMounts', 'fallbackMounts', 'pickerSelect',
            'pickerCancel', 'pickerAddNew', 'pickerEdit', 'signReviewRouteEntries', 'ledgerReads')
TRANSPORT = ('addLock', 'deposit', 'withdraw', 'secretAccess', 'broadcastAttempts',
             'blockedFetch', 'blockedXHR', 'balanceReads', 'lockReads', 'reachabilityReads',
             'passphraseReads', 'persistedLocks')


def zeros(record, fields, *, natural_history_mount=False, natural_reads=False):
    for key in fields:
        value = record.get(key)
        if type(value) is not int:
            raise RuntimeError('Missing/noninteger actual first-History counter: ' + key)
        if natural_history_mount and key in ('historyMounts', 'historyRemovals', 'historyRefreshes') and value in (0, 1):
            continue
        if natural_reads and key in ('reachabilityReads', 'passphraseReads') and value in (0, 1):
            continue
        if value != 0:
            raise RuntimeError('Already mounted/action/read/write first-History counter: ' + key)


def validate_records(rows, *, after=False):
    if not rows.get(BASELINE) or not rows.get(VAULT):
        raise RuntimeError('Successful complete current baseline/vault observer read required')
    if rows[BASELINE][-1].get('ready') is not True:
        raise RuntimeError('Actual first baseline fixture is not ready')
    if not after and rows[BASELINE][-1].get('walletPresent') is not True:
        raise RuntimeError('Observed original default dummy wallet phase required before first-History delivery')
    for row in rows[BASELINE]:
        counts, transport = row.get('counters'), row.get('transport')
        if not isinstance(counts, dict) or not isinstance(transport, dict):
            raise RuntimeError('Actual whole baseline record schema missing')
        zeros(counts, COUNTERS, natural_history_mount=after)
        zeros(transport, TRANSPORT, natural_reads=after)
        if transport.get('lastLock', 'missing') is not None:
            raise RuntimeError('Existing native lock forbids first-History delivery')
    for row in rows[VAULT]:
        zeros(row, TRANSPORT)
        if row.get('lastLock', 'missing') is not None:
            raise RuntimeError('Existing actual vault lock forbids first-History delivery')


def validate_natural_append(before, after):
    """Source-derived first mount only, never a general post-launch allowance."""
    for prefix in (BASELINE, VAULT):
        if after[prefix][:len(before[prefix])] != before[prefix]:
            raise RuntimeError('First-History original record history changed or was cleared')
    if after[VAULT][len(before[VAULT]):]:
        raise RuntimeError('Unexpected new vault event during first-History delivery')
    added = after[BASELINE][len(before[BASELINE]):]
    names = [row.get('event') for row in added]
    sequences = (('memory-history-refresh', 'history-missing', 'history-instance-mounted'),)
    if not any(tuple(names) == sequence[:len(names)] for sequence in sequences):
        raise RuntimeError('Unexpected or repeated first-History natural mount event')
    refreshed = bool(names and names[0] == 'memory-history-refresh')
    for row in added:
        event = row['event']
        counters = {key: 0 for key in COUNTERS}
        counters['historyRefreshes'] = int(refreshed)
        if event != 'memory-history-refresh':
            counters.update(historyMounts=1, historyRemovals=1)
        if row.get('counters') != counters:
            raise RuntimeError('First-History natural event counter vector differs from exact source')
        if row.get('walletPresent') is not (event == 'memory-history-refresh'):
            raise RuntimeError('First-History natural event changed dummy wallet identity phase')
        transport = row['transport']
        if transport.get('reachabilityReads') != 1 or transport.get('passphraseReads') != 1:
            raise RuntimeError('First-History hook mount does not match the single canned HEAD/root source path')


class FirstHistoryCarrier:
    def __init__(self, namespace, adapter):
        self.namespace, self.adapter = namespace, adapter
        self.host, self.output = adapter.host, Path(namespace['ROOT'])
        self.raw_case, self.raw_launch = namespace['case'], namespace['launch']
        self.raw_dump, self.raw_capture = namespace['dump'], namespace['capture']
        self.raw_tap, self.raw_adb = namespace['tap_node'], namespace['adb']
        self.ordinal = 0
        self.current_case = None
        self.launch_count = 0
        self.captured_route = None
        self.original_uri = None
        self.product_media_started = False
        self.action_started = False
        self.target_seen = False
        self.attempted = False
        self.completed = False
        self.delivery_started = None

    def case(self, name, callback):
        self.ordinal += 1
        self.current_case = name
        return self.raw_case(name, callback)

    def launch(self, route):
        if self.ordinal == 1 and self.current_case == CASE:
            self.launch_count += 1
            self.captured_route = route
            self.original_uri = 'exp://127.0.0.1:8081/--/' + route
            (self.output/'captured-first-history-original-uri.txt').write_text(self.original_uri+'\n')
        return self.raw_launch(route)

    def capture(self, name, *args, **kwargs):
        if not self.namespace['failure_capture'](name):
            self.product_media_started = True
        return self.raw_capture(name, *args, **kwargs)

    def tap(self, node):
        self.action_started = True
        return self.raw_tap(node)

    def adb(self, *args, **kwargs):
        # Original independent-case launch/metadata are unchanged. Only actual
        # product input disarms this pre-action carrier; host helper input uses
        # its separately bound raw adapter callback and does not call here.
        if args[:2] == ('shell', 'input'):
            self.action_started = True
        return self.raw_adb(*args, **kwargs)

    def dump(self, name='current'):
        if self.ordinal == 1 and self.current_case == CASE and self.attempted and not self.completed:
            raise RuntimeError('First-History URI attempt lacks native closure proof; no target polling resumes')
        tree = self.raw_dump(name)
        if self.ordinal == 1 and self.current_case == CASE:
            if any(n.get('package') == 'host.exp.exponent'
                   and n.get('text') == 'No wallet available' for n in tree.iter('node')):
                self.target_seen = True
            # Only the actual initial Welcome after full host closure may
            # enter the carrier. Other rendered screens keep original waits.
            if any(n.get('package') == 'host.exp.exponent'
                   and n.get('text') == self.host.WELCOME for n in tree.iter('node')):
                if not self.attempted:
                    tree = self.deliver(tree, name)
        return tree

    def _source(self):
        if os.environ.get('SOURCE_SHA') != SOURCE:
            raise RuntimeError('Wrong first-History source environment')
        if (self.output/'executed-source.txt').read_text().splitlines() != [SOURCE, TREE]:
            raise RuntimeError('Wrong actual first-History checkout source/tree')

    def _context(self):
        self._source()
        if (self.ordinal != 1 or self.current_case != CASE or self.launch_count != 1
                or self.captured_route != ROUTE or self.original_uri != URI):
            raise RuntimeError('Exact first independent original History launch required')
        if self.target_seen or self.product_media_started or self.action_started:
            raise RuntimeError('First-History product target/media/action already started; no URI delivery')
        if self.attempted:
            raise RuntimeError('First-History original URI delivery is strictly once-only')

    def _post_window(self):
        if self.delivery_started is None or time.monotonic()-self.delivery_started >= 30:
            raise RuntimeError('First-History native delivery exceeded the source-derived pre-poll 30-second window')

    def deliver(self, tree, name='current'):
        try:
            return self._deliver(tree, name)
        except (subprocess.SubprocessError, ET.ParseError) as error:
            raise RuntimeError('Recognized first-History delivery transport/XML failed; no target or URI retry') from error

    def _deliver(self, tree, name='current'):
        self._context()
        self.host.unobscured_welcome(tree)
        proof = getattr(self.adapter, 'expo_ordinary_closure', None)
        if (not proof or proof.get('hostMenuClosedObserved') is not True
                or proof.get('welcomeObserved') is not True):
            raise RuntimeError('Actual complete ordinary host closure and Welcome proof required')
        identity = (proof['activityRecord'], proof['taskId'])
        self.host.retained_pair(self.adapter, proof['after'], self.host.unobscured_welcome)
        before_native = self.adapter.adb('shell', 'dumpsys', 'activity', 'activities')
        if self.host.foreground_identity(before_native) != identity:
            raise RuntimeError('Original foreground Expo ExperienceActivity/task not retained')
        pid = self.adapter._pid()
        before = self.adapter._records()
        validate_records(before)
        # Required media are host-only; no History state is accepted here.
        if not self.adapter.capture('first-history-original-uri-before'):
            raise RuntimeError('Actual first-History Welcome before media missing')
        self.host.retained_pair(self.adapter, 'first-history-original-uri-before', self.host.unobscured_welcome)
        current, _ = self.adapter.dump()
        self.host.unobscured_welcome(current)
        if self.adapter._pid() != pid:
            raise RuntimeError('Expo process changed before first-History delivery')
        pre_tap_native = self.adapter.adb('shell', 'dumpsys', 'activity', 'activities')
        if self.host.foreground_identity(pre_tap_native) != identity:
            raise RuntimeError('Original Expo activity changed before first-History delivery')
        latest = self.adapter._records()
        validate_records(latest)
        self.adapter._preserved(before, latest)
        before = latest
        self.host.retain_native_text(self.adapter, 'first-history-native-before-activities.txt', before_native)
        self.host.retain_native_text(self.adapter, 'first-history-native-before-delivery-activities.txt', pre_tap_native)
        (self.output/'first-history-observer-before.json').write_text(json.dumps(before, indent=2)+'\n')
        self.attempted = True
        self.delivery_started = time.monotonic()
        result = self.adapter.adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
                                  '-d', shlex.quote(URI), '-p', 'host.exp.exponent')
        self.host.retain_native_text(self.adapter, 'first-history-original-uri-am-result.txt', result)
        statuses = re.findall(r'^Status:\s*(\S+)\s*$', result, re.MULTILINE)
        states = re.findall(r'^LaunchState:\s*(\S+)\s*$', result, re.MULTILINE)
        if statuses != ['ok'] or states != ['HOT']:
            raise RuntimeError('First-History delivery was not exactly successful HOT; no cold/new flow accepted')
        after_native = self.adapter.adb('shell', 'dumpsys', 'activity', 'activities')
        self.host.retain_native_text(self.adapter, 'first-history-native-after-activities.txt', after_native)
        if self.host.foreground_identity(after_native) != identity or self.adapter._pid() != pid:
            raise RuntimeError('First-History delivery replaced/backgrounded native Go activity/task/process')
        after = self.adapter._records()
        self._post_window()
        self.adapter._preserved(before, after)
        validate_records(after, after=True)
        validate_natural_append(before, after)
        # Capture only the actual uncovered post-delivery host, not a claimed
        # History target. A permission/host/error overlay or failed media stops.
        if not self.adapter.capture('first-history-original-uri-after'):
            raise RuntimeError('Actual post-delivery host media missing')
        self.host.retained_pair(self.adapter, 'first-history-original-uri-after', self.host.unobscured_host)
        after_tree, after_xml = self.adapter.dump(name)
        self.host.unobscured_host(after_tree)
        if self.host.foreground_identity(self.adapter.adb('shell', 'dumpsys', 'activity', 'activities')) != identity:
            raise RuntimeError('Native Go activity changed during post-delivery media')
        if self.adapter._pid() != pid:
            raise RuntimeError('Native Go process changed during post-delivery media')
        final = self.adapter._records()
        self._post_window()
        self.adapter._preserved(after, final)
        validate_records(final, after=True)
        validate_natural_append(before, final)
        for n, value in [('first-history-native-before-activities.txt', before_native),
                         ('first-history-native-before-delivery-activities.txt', pre_tap_native),
                         ('first-history-native-after-activities.txt', after_native),
                         ('first-history-post-delivery-ui.xml', after_xml)]:
            self.host.retain_native_text(self.adapter, n, value)
        (self.output/'first-history-observer-before.json').write_text(json.dumps(before, indent=2)+'\n')
        (self.output/'first-history-observer-after.json').write_text(json.dumps(final, indent=2)+'\n')
        record = {'uri': URI, 'sourceSha': SOURCE, 'sourceTree': TREE, 'firstIndependentCaseOnly': True,
                  'activityRecord': identity[0], 'taskId': identity[1], 'pid': pid,
                  'nativeLaunchState': 'HOT', 'attempts': 1, 'productStatePassed': False,
                  'noProductMediaOrActionBeforeDelivery': True,
                  'postDeliveryWindowSeconds': time.monotonic()-self.delivery_started,
                  'naturalHookReadBound': 'One canned HEAD and one dummy root read before the 30-second scheduled poll',
                  'amResultSha256': hashlib.sha256(result.encode()).hexdigest(),
                  'limit': 'Original History missing/hydrated/removal same-instance counters and media still required'}
        (self.output/'first-history-original-uri-delivery.json').write_text(json.dumps(record, indent=2)+'\n')
        self.completed = True
        return after_tree


def install(namespace):
    carrier = FirstHistoryCarrier(namespace, namespace['BASELINE_HOST_ADAPTER'])
    for name, callback in [('case', carrier.case), ('launch', carrier.launch), ('dump', carrier.dump),
                           ('capture', carrier.capture), ('tap_node', carrier.tap), ('adb', carrier.adb)]:
        namespace[name] = callback
    namespace['BASELINE_FIRST_HISTORY_CARRIER'] = carrier
    return carrier
