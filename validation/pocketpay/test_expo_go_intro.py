"""Observed XML + synthetic-negative parser checks; never connects to ADB."""
import copy
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'camera'))
import camera_followup as original
from expo_go_intro import intro_sheet, intro_continue, MARKERS


class ObservedIntro(unittest.TestCase):
    def setUp(self):
        self.tree = ET.parse(HERE / 'receipts/run-37379451997/camera/observed-sdk54-intro.xml').getroot()

    def test_exact_observed_intro_is_distinct_from_prior_sheet(self):
        self.assertTrue(intro_sheet(self.tree))
        self.assertFalse(original.developer_sheet(self.tree))
        node = intro_continue(self.tree, original.exact_action)
        self.assertEqual(node.get('class'), 'android.widget.Button')
        self.assertEqual(original.bounds(node), (48, 1100, 672, 1200))

    def test_each_exact_marker_is_required(self):
        for marker in MARKERS:
            with self.subTest(marker=marker):
                tree = copy.deepcopy(self.tree)
                for node in tree.iter('node'):
                    if node.get('text') == marker:
                        node.set('text', 'SYNTHETIC_UNRECOGNIZED_CONTEXT')
                self.assertFalse(intro_sheet(tree))
                with self.assertRaises(RuntimeError):
                    intro_continue(tree, original.exact_action)

    def test_other_native_package_is_not_tutorial(self):
        for node in self.tree.iter('node'):
            node.set('package', 'SYNTHETIC_OTHER_APP')
        self.assertFalse(intro_sheet(self.tree))

    def test_native_permission_overlay_blocks_host_onboarding(self):
        ET.SubElement(self.tree, 'node', {'package':'com.android.permissioncontroller', 'text':'Allow'})
        self.assertFalse(intro_sheet(self.tree))
        with self.assertRaises(RuntimeError):
            intro_continue(self.tree, original.exact_action)

    def test_disabled_native_button_is_not_actionable(self):
        node = intro_continue(self.tree, original.exact_action)
        node.set('enabled', 'false')
        with self.assertRaises(RuntimeError):
            intro_continue(self.tree, original.exact_action)

    def test_disabled_ancestor_blocks_action(self):
        self.tree[0].set('enabled', 'false')
        with self.assertRaises(RuntimeError):
            intro_continue(self.tree, original.exact_action)

    def test_duplicate_enabled_continue_is_ambiguous(self):
        node = intro_continue(self.tree, original.exact_action)
        self.tree.append(copy.deepcopy(node))
        with self.assertRaises(RuntimeError):
            intro_continue(self.tree, original.exact_action)

    def test_outside_sheet_continue_is_not_actionable(self):
        node = intro_continue(self.tree, original.exact_action)
        node.set('content-desc', 'SYNTHETIC_OTHER')
        ET.SubElement(self.tree, 'node', {'package':'host.exp.exponent', 'class':'android.widget.Button',
            'content-desc':'Continue', 'enabled':'true', 'clickable':'true', 'bounds':'[48,1100][672,1200]'})
        with self.assertRaises(RuntimeError):
            intro_continue(self.tree, original.exact_action)

    def test_unlabelled_x_is_not_inferred(self):
        node = intro_continue(self.tree, original.exact_action)
        node.set('content-desc', '')
        # Child text is not an enabled clickable action. The unlabelled X
        # already present in the real XML must never be guessed instead.
        with self.assertRaises(RuntimeError):
            intro_continue(self.tree, original.exact_action)

    def test_non_button_continue_is_not_observed_native_action(self):
        node = intro_continue(self.tree, original.exact_action)
        node.set('class', 'android.widget.TextView')
        with self.assertRaises(RuntimeError):
            intro_continue(self.tree, original.exact_action)


if __name__ == '__main__':
    unittest.main()
