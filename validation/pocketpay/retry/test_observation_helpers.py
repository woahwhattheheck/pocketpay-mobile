"""Pure parser checks. No ADB, guest, capture, input or product mocks execute."""
import os
import unittest
import xml.etree.ElementTree as ET
os.environ.setdefault('ARTIFACT_DIR', '/tmp')
from observation_helpers import bounds, developer_sheet, exact_action, require_uncovered

class ActionParserChecks(unittest.TestCase):
    def tree(self, body):
        return ET.fromstring('<hierarchy>' + body + '</hierarchy>')

    def test_same_label_attributes_resolve_one_real_action(self):
        tree = self.tree('<node text="Check Status" content-desc="Check Status" enabled="true" clickable="true" bounds="[20,200][700,260]"/>')
        self.assertEqual(bounds(exact_action(tree, 'Check Status')), (20, 200, 700, 260))

    def test_child_text_under_disabled_touchable_is_rejected(self):
        tree = self.tree('<node enabled="false" clickable="true" bounds="[20,200][700,260]"><node text="Check Status" enabled="true" bounds="[30,210][690,250]"/></node>')
        self.assertIsNone(exact_action(tree, 'Check Status'))

    def test_disabled_ancestor_above_clickable_action_is_rejected(self):
        tree = self.tree('<node enabled="false"><node text="Check Status" enabled="true" clickable="true" bounds="[20,200][700,260]"/></node>')
        self.assertIsNone(exact_action(tree, 'Check Status'))

    def test_two_distinct_visible_actions_fail_closed(self):
        tree = self.tree('<node text="Check Status" enabled="true" clickable="true" bounds="[20,200][700,260]"/><node content-desc="Check Status" enabled="true" clickable="true" bounds="[20,300][700,360]"/>')
        with self.assertRaises(RuntimeError):
            exact_action(tree, 'Check Status')

    def test_clipped_or_offscreen_rectangle_is_rejected(self):
        tree = self.tree('<node text="Check Status" enabled="true" clickable="true" bounds="[20,1200][700,1300]"/>')
        self.assertIsNone(exact_action(tree, 'Check Status'))

    def test_plain_heading_and_substring_are_not_actions(self):
        tree = self.tree('<node text="Check Status" enabled="true" bounds="[20,200][700,260]"/><node text="Close, Check Status" enabled="true" clickable="true" bounds="[20,300][700,360]"/>')
        self.assertIsNone(exact_action(tree, 'Check Status'))

    def test_developer_sheet_requires_both_actual_labels(self):
        partial = self.tree('<node text="SDK 54"/>')
        covered = self.tree('<node text="SDK 54"/><node text="Connected to expo-cli"/>')
        self.assertFalse(developer_sheet(partial))
        self.assertTrue(developer_sheet(covered))
        with self.assertRaises(RuntimeError):
            require_uncovered(covered)

if __name__ == '__main__':
    unittest.main()
