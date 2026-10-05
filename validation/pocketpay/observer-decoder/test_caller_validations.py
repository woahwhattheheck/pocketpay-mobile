"""Immutable caller AST differentials, using only already-retained log text as ADB input."""
import ast
import copy
import json
from pathlib import Path
import re
import tempfile
import unittest

from observer_framing import GAP_PREFIX, PRIMARY_PREFIX, decode_observer_line
from reproduce_receipt import ARTIFACTS, IMMUTABLE


class OriginalSafetyError(RuntimeError):
    pass


class FramingOnly(ast.NodeTransformer):
    """Replace only the original raw_decode try block; retain all caller validators."""
    def __init__(self):
        self.replaced = 0

    def visit_Try(self, node):
        if ".raw_decode(" not in ast.unparse(node):
            return self.generic_visit(node)
        self.replaced += 1
        append = any(isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute)
                     and child.func.attr == "append" for child in ast.walk(node))
        replacement = "record = decode_observer_line(line, prefix)\nif record is None:\n    continue\n"
        if append:
            replacement += "records.append(record)\n"
        return ast.parse(replacement).body


def callers(log_text, output, patched):
    definitions = []
    for saved in IMMUTABLE["functions"].values():
        definitions.append(copy.deepcopy(ast.parse(saved["source"]).body[0]))
    module = ast.Module(body=definitions, type_ignores=[])
    if patched:
        transformer = FramingOnly()
        module = transformer.visit(module)
        if transformer.replaced != 2:
            raise RuntimeError("Caller decoder structure differs; refusing broad transformation")
    namespace = {"json": json, "re": re, "ROOT": Path(output), "UnsafeEnvironment": OriginalSafetyError,
                 "adb": lambda *args: log_text, "decode_observer_line": decode_observer_line}
    exec(compile(ast.fix_missing_locations(module), "immutable-retained-parser-functions", "exec"), namespace)
    return namespace


def frame(prefix, record):
    return "10-05 22:12:41.875 10048 10146 I ReactNativeJS: '" + prefix + "', '" + json.dumps(record) + "'"


class CallerValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pocketpay-pure-caller-parser-")
        self.addCleanup(self.temp.cleanup)
        self.actual = (ARTIFACTS / "logcat.txt").read_text(errors="replace")
        self.gap = [record for line in self.actual.splitlines()
                    if (record := decode_observer_line(line, GAP_PREFIX)) is not None][-1]
        self.primary = [record for line in self.actual.splitlines()
                        if (record := decode_observer_line(line, PRIMARY_PREFIX)) is not None][-1]

    def test_exact_original_functions_reject_actual_quoted_logcat(self):
        namespace = callers(self.actual, self.temp.name, False)
        for function, args in (("native_records", ()), ("snapshot", ("old", "mismatch")),
                               ("primary_snapshot", ("old", "unknown", 0, 0))):
            with self.subTest(function=function), self.assertRaisesRegex(RuntimeError, "No actual native"):
                namespace[function](*args)

    def test_only_framing_repair_preserves_actual_gap_state(self):
        namespace = callers(self.actual, self.temp.name, True)
        records = namespace["native_records"]()
        self.assertEqual(len(records), 4)
        self.assertEqual(namespace["snapshot"]("new", "mismatch"), self.gap)

    def test_gap_source_outcome_nonzero_and_missing_safety_still_rejected(self):
        cases = [("source", {**self.gap, "sourceSha": "wrong-source"}),
                 ("outcome", {**self.gap, "outcome": "nohash"}),
                 ("nonzero-secret", {**self.gap, "counters": {**self.gap["counters"], "secretCalls": 1}}),
                 ("nonzero-write", {**self.gap, "counters": {**self.gap["counters"], "rpcWrites": 1}}),
                 ("missing-write", {**self.gap, "counters": {key: value for key, value in self.gap["counters"].items() if key != "rpcWrites"}})]
        for name, record in cases:
            namespace = callers(frame(GAP_PREFIX, record), self.temp.name, True)
            with self.subTest(case=name), self.assertRaises(OriginalSafetyError):
                namespace["snapshot"]("reject-" + name, "mismatch")

    def test_gap_unknown_clear_validator_unchanged(self):
        record = {**self.gap, "counters": {**self.gap["counters"], "unknownClears": 1}}
        namespace = callers(frame(GAP_PREFIX, record), self.temp.name, True)
        with self.assertRaisesRegex(RuntimeError, "unexpectedly cleared"):
            namespace["snapshot"]("cleared", "mismatch")

    def test_primary_preserves_actual_initialization_state_only(self):
        namespace = callers(self.actual, self.temp.name, True)
        self.assertEqual(namespace["primary_snapshot"]("initialization-only", "unknown", 0, 0), self.primary)
        # Same actual record cannot satisfy a claimed native submission.
        with self.assertRaisesRegex(RuntimeError, "Unexpected observed dummy submission"):
            namespace["primary_snapshot"]("no-submit-proof", "unknown", 1, 0)

    def test_primary_source_outcome_nonzero_safety_still_rejected(self):
        cases = [("source", {**self.primary, "sourceSha": "wrong-source"}),
                 ("outcome", {**self.primary, "outcome": "error"}),
                 ("nonzero-write", {**self.primary, "counters": {**self.primary["counters"], "rpcWrites": 1}}),
                 ("missing-broadcast", {**self.primary, "counters": {key: value for key, value in self.primary["counters"].items() if key != "broadcastAttempts"}})]
        for name, record in cases:
            namespace = callers(frame(PRIMARY_PREFIX, record), self.temp.name, True)
            with self.subTest(case=name), self.assertRaises(RuntimeError):
                namespace["primary_snapshot"]("reject-" + name, "unknown", 0, 0)


if __name__ == "__main__":
    unittest.main()
