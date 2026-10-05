"""Compose the frozen gap collector with a native covered-UI rejection guard."""
import runpy
import sys
from pathlib import Path
from native_overlay import assert_no_native_error_overlay

base = Path(__file__).resolve().parent / 'retry'
sys.path.insert(0, str(base))
import observation_helpers as helpers

original_contains = helpers.contains
original_action = helpers.exact_action


def guarded_contains(tree, label):
    assert_no_native_error_overlay(tree)
    return original_contains(tree, label)


def guarded_action(tree, label):
    assert_no_native_error_overlay(tree)
    return original_action(tree, label)


if __name__ == '__main__':
    # Only controller observation helpers change. Frozen route/transport/store
    # observer and production code remain byte-for-byte unchanged.
    helpers.contains = guarded_contains
    helpers.exact_action = guarded_action
    runpy.run_path(str(base / 'retry_gap_ui.py'), run_name='__main__')
