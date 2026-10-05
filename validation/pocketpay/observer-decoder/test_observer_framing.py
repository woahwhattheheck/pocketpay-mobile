"""Pure positive/negative/differential tests; never import or operate a controller."""
import json
import unittest

from observer_framing import GAP_PREFIX, PRIMARY_PREFIX, decode_observer_line


class FramingTests(unittest.TestCase):
    def setUp(self):
        self.record = {"sourceSha": "ddd56649099d1fc5763ef29af3bfba0363897bd6", "outcome": "mismatch",
                       "counters": {"submitCalls": 0, "readCalls": 0}, "phase": "unknown"}
        self.payload = json.dumps(self.record, separators=(",", ":"))

    def test_bare_exact_prefix_object(self):
        self.assertEqual(decode_observer_line(GAP_PREFIX + " " + self.payload, GAP_PREFIX), self.record)

    def test_actual_quoted_body(self):
        self.assertEqual(decode_observer_line("'" + GAP_PREFIX + "', '" + self.payload + "'", GAP_PREFIX), self.record)

    def test_actual_native_and_metro_envelopes(self):
        native = "10-05 22:12:41.875 10048 10146 I ReactNativeJS: '" + GAP_PREFIX + "', '" + self.payload + "'"
        metro = " INFO  " + GAP_PREFIX + " " + self.payload
        for line in (native, metro):
            self.assertEqual(decode_observer_line(line, GAP_PREFIX), self.record)

    def test_differential_original_rejects_actual_quoted_framing(self):
        line = "10-05 22:12:41.875 10048 10146 I ReactNativeJS: '" + GAP_PREFIX + "', '" + self.payload + "'"
        with self.assertRaises(json.JSONDecodeError):
            json.JSONDecoder().raw_decode(line.split(GAP_PREFIX, 1)[1].lstrip(" :"))
        self.assertEqual(decode_observer_line(line, GAP_PREFIX), self.record)

    def test_original_unquoted_payload_semantics_unchanged(self):
        line = GAP_PREFIX + " " + self.payload
        original = json.JSONDecoder().raw_decode(line.split(GAP_PREFIX, 1)[1].lstrip(" :"))[0]
        self.assertEqual(decode_observer_line(line, GAP_PREFIX), original)

    def test_wrong_prefix_and_embedded_marker_rejected(self):
        bad = [PRIMARY_PREFIX + " " + self.payload, "noise " + GAP_PREFIX + " " + self.payload,
               GAP_PREFIX + "_EXTRA " + self.payload, "INFO unrelated " + GAP_PREFIX + " " + self.payload]
        for line in bad:
            with self.subTest(line=line):
                self.assertIsNone(decode_observer_line(line, GAP_PREFIX))

    def test_wrong_native_tag_level_or_envelope_rejected(self):
        for envelope in ("10-05 22:12:41.875 10048 10146 I OtherJS: ",
                         "10-05 22:12:41.875 10048 10146 E ReactNativeJS: ", " WARN  "):
            self.assertIsNone(decode_observer_line(envelope + GAP_PREFIX + " " + self.payload, GAP_PREFIX))

    def test_malformed_mismatched_quotes_or_trailing_material_rejected(self):
        bad = [GAP_PREFIX + " {bad}", GAP_PREFIX + " " + self.payload + " {}",
               GAP_PREFIX + " " + self.payload + " trailing", "'" + GAP_PREFIX + "', '" + self.payload,
               "'" + GAP_PREFIX + "', '" + self.payload + "' trailing",
               "'" + GAP_PREFIX + "', '" + self.payload + " {}'", GAP_PREFIX + " " + self.payload + "\nnoise"]
        for line in bad:
            with self.subTest(line=line):
                self.assertIsNone(decode_observer_line(line, GAP_PREFIX))

    def test_nonobject_duplicate_key_and_nonfinite_rejected(self):
        for payload in ("[]", "null", '"text"', '{"outcome":"empty","outcome":"mismatch"}', '{"count":NaN}'):
            self.assertIsNone(decode_observer_line(GAP_PREFIX + " " + payload, GAP_PREFIX))

    def test_semantic_validation_is_preserved_for_existing_callers(self):
        unsafe = {**self.record, "sourceSha": "wrong-source", "counters": {"submitCalls": 1}}
        decoded = decode_observer_line(GAP_PREFIX + " " + json.dumps(unsafe), GAP_PREFIX)
        self.assertEqual(decoded, unsafe)  # framing never sanitizes away a failing safety fact


if __name__ == "__main__":
    unittest.main()
