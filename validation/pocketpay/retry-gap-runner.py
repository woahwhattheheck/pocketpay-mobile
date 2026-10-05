"""Compose the frozen gap collector with a native covered-UI rejection guard."""
import runpy
import sys
import time
from pathlib import Path
from native_overlay import assert_no_native_error_overlay
from expo_go_intro import intro_sheet
from expo_go_module_intro import ModuleIntro
from observer_framing import decode_observer_line

base = Path(__file__).resolve().parent / 'retry'
sys.path.insert(0, str(base))
import observation_helpers as helpers

original_contains = helpers.contains
original_action = helpers.exact_action
original_sheet = helpers.developer_sheet
intro = ModuleIntro(vars(helpers))


def guarded_contains(tree, label):
    assert_no_native_error_overlay(tree)
    return original_contains(tree, label)


def guarded_action(tree, label):
    assert_no_native_error_overlay(tree)
    return original_action(tree, label)


def known_sheet(tree):
    return intro_sheet(tree) or original_sheet(tree)


def wait_with_observed_intro(label, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        tree = helpers.dump()
        assert_no_native_error_overlay(tree)
        if intro_sheet(tree):
            intro.dismiss(tree)
            continue
        if original_sheet(tree):
            name = 'observed-expo-developer-sheet-' + str(time.time_ns())
            (helpers.ROOT / (name + '.xml')).write_text(helpers.ET.tostring(tree, encoding='unicode'))
            (helpers.ROOT / (name + '.json')).write_text(helpers.json.dumps({'observedLabels': helpers.labels(tree),
                'action': 'native BACK after actual SDK and Connected-to-expo-cli labels'}, indent=2))
            helpers.adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
            continue
        if guarded_contains(tree, label):
            return tree
        time.sleep(0.3)
    helpers.capture('unmatched-state')
    raise RuntimeError('Expected actual UI did not appear: ' + label)


def decoded_native_records():
    # Exact immutable native_records logic, replacing only its framing decode.
    prefix = 'POCKETPAY_RETRY_GAP_NATIVE_OBSERVER'
    records = []
    for line in helpers.adb('logcat', '-d', '-s', 'ReactNativeJS:I').splitlines():
        if prefix not in line:
            continue
        record = decode_observer_line(line, prefix)
        if record is None:
            continue
        records.append(record)
    if not records:
        raise RuntimeError('No actual native observer records were captured.')
    return records


if __name__ == '__main__':
    # Only controller observation helpers change. Frozen route/transport/store
    # observer and production code remain byte-for-byte unchanged.
    helpers.contains = guarded_contains
    helpers.exact_action = guarded_action
    helpers.developer_sheet = known_sheet
    helpers.wait = wait_with_observed_intro
    helpers.native_records = decoded_native_records
    runpy.run_path(str(base / 'retry_gap_ui.py'), run_name='__main__')
