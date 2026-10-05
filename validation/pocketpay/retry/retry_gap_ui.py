"""Bounded retry gap guest measurements; preparation is not device evidence."""
import json
import os
import sys
import time
from observation_helpers import ROOT, UnsafeEnvironment, adb, capture, contains, dump, launch, native_records, require_uncovered, snapshot, tap, wait

SOURCE_SHA = 'ddd56649099d1fc5763ef29af3bfba0363897bd6'
if os.environ.get('SOURCE_SHA') != SOURCE_SHA:
    raise RuntimeError('Require the exact canonical retry source SHA.')
REPORT = {'sourceSha': SOURCE_SHA, 'sourceTree': '4e363d77915ca16d3490e677f78c6487aeeb7060',
          'productionPaymentRetryScreenUnchanged': True, 'fixtureReadTransportControlled': True,
          'liveSigningOrBroadcast': False, 'cases': [], 'optionalObservations': []}

def require_unknown(state, outcome, identity=None):
    if not state['unknownPresent'] or state['phase'] != 'unknown' or state['requestId'] != 'native-dummy-' + outcome:
        raise RuntimeError('The actual uncertain submission was not preserved.')
    if identity is not None and state['unknownIdentity'] != identity:
        raise RuntimeError('The uncertain submission identity changed.')
    if identity is not None:
        seeded = False
        for record in native_records():
            if record.get('requestId') == 'native-dummy-' + outcome:
                seeded = True
            if seeded and (not record['unknownPresent'] or record['unknownIdentity'] != identity
                           or record.get('requestId') != 'native-dummy-' + outcome):
                raise RuntimeError('An observed post-seeding submission identity changed.')

def activity(outcome, identity=None):
    tap('View Activity', scroll=True)
    wait('No activity yet')
    capture(outcome + '-actual-activity')
    state = snapshot(outcome + '-activity', outcome)
    if outcome == 'empty':
        if state['unknownPresent']:
            raise RuntimeError('Empty session acquired an uncertain payment.')
    else:
        require_unknown(state, outcome, identity)
    return state

def details_and_help(outcome):
    tap('View Payment Details', scroll=True)
    wait('1.25 XLM')
    tree = capture(outcome + '-actual-details')
    for label in ('Amount', 'To', 'Network', 'Testnet'):
        if not contains(tree, label):
            raise RuntimeError('Missing real review detail: ' + label)
    if outcome == 'nohash' and contains(tree, 'Transaction Hash'):
        raise RuntimeError('No-hash details unexpectedly displayed a transaction identity.')
    tap('Hide Payment Details', scroll=True)
    tap('Get Help', scroll=True)
    tree = wait('Payment status help')
    if not contains(tree, 'Never share your secret key'):
        raise RuntimeError('Real help omitted its secret-safety guidance.')
    capture(outcome + '-actual-help')
    # Native alert acknowledgement only; no external application/recipient opens.
    tap('OK')

def nohash():
    launch('nohash')
    tree = wait('No transaction hash is available', seconds=100)
    if contains(tree, 'Check Status') or contains(tree, 'Checking Status'):
        raise RuntimeError('A status lookup action appeared without transaction identity.')
    capture('nohash-actual-guidance')
    first = snapshot('nohash-guidance', 'nohash')
    require_unknown(first, 'nohash')
    if first['transactionHash'] is not None or first['counters']['readCalls'] != 0:
        raise RuntimeError('No-hash state performed a transaction lookup.')
    details_and_help('nohash')
    final = activity('nohash', first['unknownIdentity'])
    if final['counters']['readCalls'] != 0:
        raise RuntimeError('No-hash guidance actions performed a status lookup.')

def empty():
    launch('empty')
    tree = wait('No uncertain payment is available', seconds=100)
    for action in ('Check Status', 'Checking Status', 'View Payment Details', 'Get Help'):
        if contains(tree, action):
            raise RuntimeError('Empty session exposed an inapplicable payment action.')
    capture('empty-actual-guidance')
    first = snapshot('empty-guidance', 'empty')
    if first['unknownPresent'] or first['counters']['readCalls'] != 0:
        raise RuntimeError('Empty session retained or looked up an uncertain payment.')
    final = activity('empty')
    if final['counters']['readCalls'] != 0:
        raise RuntimeError('Empty session performed a status lookup.')

def mismatch():
    launch('mismatch')
    wait('Payment Status Unknown', seconds=100)
    capture('mismatch-actual-unknown')
    first = snapshot('mismatch-before-lookup', 'mismatch')
    require_unknown(first, 'mismatch')
    if first['transactionHash'] != 'a' * 64 or first['counters']['readCalls'] != 0:
        raise RuntimeError('Wrong initial dummy transaction identity.')
    tap('Check Status')
    # The actual production busy UI is transient. Claim it only if measured.
    immediate = dump('mismatch-immediate-native-ui')
    require_uncovered(immediate)
    busy = contains(immediate, 'Checking Status')
    busy_frame = False
    if busy:
        busy_frame = capture('mismatch-observed-checking-status', required_label='Checking Status') is not None
    REPORT['optionalObservations'].append({'name': 'mismatch-native-checking-status',
        'result': 'observed-in-retained-actual-xml' if busy else 'not_observed',
        'pngCheckingBeforeAndAfter': busy_frame})
    tree = wait('Could not check the payment status')
    capture('mismatch-actual-safe-lookup-error')
    if not contains(tree, 'Payment Status Unknown') or contains(tree, 'Payment Not Completed') or contains(tree, 'Payment Confirmed'):
        raise RuntimeError('Mismatched lookup incorrectly resolved the payment.')
    state = snapshot('mismatch-after-lookup', 'mismatch')
    require_unknown(state, 'mismatch', first['unknownIdentity'])
    counts = state['counters']
    if (counts['readCalls'], counts['readCompleted'], counts['mismatchResponses'], counts['readErrors']) != (1, 1, 1, 0):
        raise RuntimeError('Expected exactly one completed fixture response with mismatched identity.')
    lookup = state['lastLookup']
    if lookup['requestedHash'] != 'a' * 64 or lookup['responseHash'] != 'b' * 64 or lookup['successful'] is not False or lookup['elapsedMs'] < 1500:
        raise RuntimeError('The unchanged delayed mismatched fixture response was not measured.')
    details_and_help('mismatch')
    final = activity('mismatch', first['unknownIdentity'])
    if final['transactionHash'] != 'a' * 64 or final['counters']['readCalls'] != 1:
        raise RuntimeError('Activity lost transaction identity or performed another lookup.')

blocked_reason = None
for name, callback in (('nohash-guidance-no-lookup', nohash), ('empty-session-no-lookup', empty),
                       ('mismatched-lookup-preserves-unknown', mismatch)):
    if blocked_reason:
        REPORT['cases'].append({'name': name, 'result': 'blocked/unattempted', 'reason': blocked_reason})
        (ROOT / 'retry-gap-observations.json').write_text(json.dumps(REPORT, indent=2))
        continue
    result = {'name': name, 'result': 'failed'}
    try:
        callback()
        result['result'] = 'passed'
    except Exception as error:
        result['error'] = str(error)
        if isinstance(error, UnsafeEnvironment):
            blocked_reason = str(error)
            result['captureExcluded'] = 'Unsafe condition; no additional guest interaction.'
        else:
            try:
                capture('failure-' + name)
            except Exception as capture_error:
                result['captureError'] = str(capture_error)
                if isinstance(capture_error, UnsafeEnvironment):
                    blocked_reason = str(capture_error)
    REPORT['cases'].append(result)
    (ROOT / 'retry-gap-observations.json').write_text(json.dumps(REPORT, indent=2))
print(json.dumps(REPORT, indent=2))
sys.exit(0 if len(REPORT['cases']) == 3 and all(case['result'] == 'passed' for case in REPORT['cases']) else 1)
