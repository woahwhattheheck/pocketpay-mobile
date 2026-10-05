"""Parser-only unit checks; no native UI, ADB, screenshots or controller execution."""
import unittest
import xml.etree.ElementTree as ET

from camera_followup import UnsafeMedia, bounds, developer_sheet, exact_action, guard_xml


class ParserTests(unittest.TestCase):
    def tree(self, nodes):
        return ET.fromstring("<hierarchy>" + nodes + "</hierarchy>")

    def test_exact_attributes_do_not_duplicate_label(self):
        tree = self.tree('<node text="Request camera permission" content-desc="Request camera permission" '
                         'enabled="true" clickable="true" bounds="[1,2][3,4]" package="host.exp.exponent"/>')
        self.assertIsNotNone(exact_action(tree, "Request camera permission", {"host.exp.exponent"}))

    def test_substring_close_and_plain_heading_are_not_actions(self):
        tree = self.tree('<node content-desc="Close, Keep Reviewing" enabled="true" clickable="true" '
                         'bounds="[1,2][3,4]"/><node text="Keep Reviewing" enabled="true" clickable="false" '
                         'bounds="[1,2][3,4]"/>')
        with self.assertRaises(RuntimeError):
            exact_action(tree, "Keep Reviewing")

    def test_disabled_and_ambiguous_nodes_fail(self):
        disabled = self.tree('<node text="Action" enabled="false" clickable="true" bounds="[1,2][3,4]"/>')
        with self.assertRaises(RuntimeError):
            exact_action(disabled, "Action")
        duplicate = self.tree(2 * '<node text="Action" enabled="true" clickable="true" bounds="[1,2][3,4]"/>')
        with self.assertRaises(RuntimeError):
            exact_action(duplicate, "Action")

    def test_scoped_os_resource_id_handles_localized_text(self):
        tree = self.tree('<node text="Localized denial" enabled="true" clickable="true" bounds="[1,2][3,4]" '
                         'package="com.android.permissioncontroller" '
                         'resource-id="com.android.permissioncontroller:id/permission_deny_button"/>')
        self.assertIsNotNone(exact_action(tree, "Don't allow", {"com.android.permissioncontroller"},
                                        ":id/permission_deny_button"))
        with self.assertRaises(RuntimeError):
            exact_action(tree, "Don't allow", {"host.exp.exponent"}, ":id/permission_deny_button")

    def test_reveal_accessibility_label_rejects_before_media(self):
        with self.assertRaises(UnsafeMedia):
            guard_xml('<hierarchy><node content-desc="Revealed secret key"/></hierarchy>')

    def test_secret_shaped_parser_input_rejects_without_actual_key(self):
        with self.assertRaises(UnsafeMedia):
            guard_xml('<hierarchy><node text="' + "S" + 55 * "A" + '"/></hierarchy>')

    def test_disabled_ancestor_rejects_enabled_child(self):
        tree = self.tree('<node enabled="false"><node text="Action" enabled="true" clickable="true" '
                         'bounds="[1,2][3,4]"/></node>')
        with self.assertRaises(RuntimeError):
            exact_action(tree, "Action")

    def test_specific_developer_sheet_labels(self):
        tree = self.tree('<node text="SDK Version"/><node text="Connected to expo-cli"/>')
        self.assertTrue(developer_sheet(tree))
        self.assertFalse(developer_sheet(self.tree('<node text="SDK"/><node text="Connected to expo-cli"/>')))

    def test_native_permission_prompt_prevents_back_dismissal(self):
        tree = self.tree('<node text="SDK Version"/><node text="Connected to expo-cli"/>'
                         '<node package="com.android.permissioncontroller" '
                         'resource-id="com.android.permissioncontroller:id/permission_deny_button"/>')
        self.assertFalse(developer_sheet(tree))

    def test_targets_outside_fixed_viewport_are_rejected(self):
        for box in ("[710,2][730,20]", "[1,1270][20,1300]", "[800,2][850,20]"):
            node = ET.fromstring('<node bounds="' + box + '"/>')
            self.assertIsNone(bounds(node))
        self.assertEqual(bounds(ET.fromstring('<node bounds="[0,0][720,1280]"/>')), (0, 0, 720, 1280))


if __name__ == "__main__":
    unittest.main()
