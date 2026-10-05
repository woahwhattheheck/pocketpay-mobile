"""Read-only synthetic parser checks; these tests never launch ADB or production UI."""
import base64
import binascii
import unittest

from ui_guard import (DESTINATION_LABEL, PUBLIC_RECIPIENT, SCAN_ACTION, UnsafeEnvironment, UnsafeMedia,
                      destination_field, effective_viewport, exact_action, guard_xml, ime_visible, product_guard)


def node(text="", *, children="", **attributes):
    attributes = {"text": text, "package": "host.exp.exponent", "enabled": "true",
                  "clickable": "false", "bounds": "[20,100][700,150]", **attributes}
    from xml.sax.saxutils import quoteattr
    attrs = " ".join(key.replace("_", "-") + "=" + quoteattr(str(value)) for key, value in attributes.items())
    return "<node " + attrs + ">" + children + "</node>"


def form(value="G...", *, disabled=False, label=DESTINATION_LABEL, memo="Payment reference", recipient_bounds="[20,170][640,226]"):
    field = node(value, **{"class": "android.widget.EditText", "clickable": "true", "focusable": "true",
                          "password": "false", "bounds": recipient_bounds})
    recipient_group = node(children=node(label) + field, enabled="false" if disabled else "true")
    amount = node("0.00", **{"class": "android.widget.EditText", "clickable": "true", "focusable": "true", "bounds": "[20,310][700,366]"})
    memo_field = node(memo, **{"class": "android.widget.EditText", "clickable": "true", "focusable": "true", "bounds": "[20,430][700,486]"})
    return guard_xml("<hierarchy>" + node("Send XLM") + recipient_group + amount + memo_field + "</hierarchy>")


class GuardChecks(unittest.TestCase):
    def test_fixed_dummy_is_valid_public_address_without_secret(self):
        decoded = base64.b32decode(PUBLIC_RECIPIENT)
        self.assertEqual(len(PUBLIC_RECIPIENT), 56)
        self.assertEqual(decoded[0], 48)
        self.assertEqual(int.from_bytes(decoded[-2:], "little"), binascii.crc_hqx(decoded[:-2], 0))

    def test_actual_three_fields_exact_initial_placeholder(self):
        target, association = destination_field(form(), "", initial=True)
        self.assertEqual(target.get("text"), "G...")
        self.assertEqual(association, "exact-label-and-unique-form-ancestor")

    def test_full_native_public_value_is_required(self):
        target, _ = destination_field(form(PUBLIC_RECIPIENT), PUBLIC_RECIPIENT)
        self.assertEqual(target.get("text"), PUBLIC_RECIPIENT)
        with self.assertRaises(RuntimeError):
            destination_field(form(PUBLIC_RECIPIENT[:-1]), PUBLIC_RECIPIENT)

    def test_disabled_ancestor_rejects_field(self):
        with self.assertRaises(RuntimeError):
            destination_field(form(disabled=True), "", initial=True)

    def test_clipped_or_offscreen_field_rejected(self):
        for geometry in ("[20,170][721,226]", "[20,1200][640,1300]", "[20,170][20,226]"):
            with self.subTest(geometry=geometry), self.assertRaises(RuntimeError):
                destination_field(form(recipient_bounds=geometry), "", initial=True)

    def test_wrong_label_or_changed_memo_rejected(self):
        for tree in (form(label="Amount"), form(memo="entered memo")):
            with self.assertRaises(RuntimeError):
                destination_field(tree, "", initial=True)

    def test_clickable_ancestor_exact_label_and_disabled_full_chain(self):
        text = node(SCAN_ACTION)
        tree = guard_xml("<hierarchy>" + node(children=text, clickable="true") + "</hierarchy>")
        self.assertEqual(exact_action(tree, SCAN_ACTION).get("clickable"), "true")
        disabled = guard_xml("<hierarchy>" + node(children=node(children=text, clickable="true"), enabled="false") + "</hierarchy>")
        with self.assertRaises(RuntimeError):
            exact_action(disabled, SCAN_ACTION)

    def test_duplicate_action_rejected(self):
        action = node(SCAN_ACTION, clickable="true")
        with self.assertRaises(RuntimeError):
            exact_action(guard_xml("<hierarchy>" + action + action + "</hierarchy>"), SCAN_ACTION)

    def test_covered_developer_or_permission_ui_rejected_first(self):
        for overlay in (node("SDK Version") + node("Connected to expo-cli"),
                        node("While using the app", package="com.android.permissioncontroller")):
            with self.assertRaises(RuntimeError):
                product_guard(guard_xml("<hierarchy>" + node("Send XLM") + overlay + "</hierarchy>"))

    def test_secret_or_password_rejected_before_media(self):
        for xml in (node("S" + "A" * 55), node("Revealed secret key"), node("masked", password="true")):
            with self.assertRaises(UnsafeMedia):
                guard_xml("<hierarchy>" + xml + "</hierarchy>")

    def test_invalid_xml_is_unsafe_environment(self):
        with self.assertRaises(UnsafeEnvironment):
            guard_xml("<hierarchy><node>")

    def test_actual_error_overlay_rejected(self):
        for label in ("Uncaught Error", "Something went wrong", "Invalid QR Code"):
            with self.assertRaises(RuntimeError):
                product_guard(guard_xml("<hierarchy>" + node("Send XLM") + node(label) + "</hierarchy>"))

    def test_native_ime_visibility_requires_unambiguous_actual_flag(self):
        self.assertTrue(ime_visible("mInputShown=true"))
        self.assertFalse(ime_visible("mInputShown=false"))
        for raw in ("unknown", "mInputShown=true isInputViewShown=false"):
            with self.assertRaises(RuntimeError):
                ime_visible(raw)

    def test_effective_viewport_accepts_reviewed_runner_override(self):
        self.assertEqual(effective_viewport("Physical size: 1080x1920\nOverride size: 720x1280")["effective"], [720, 1280])
        self.assertEqual(effective_viewport("Physical size: 720x1280")["effective"], [720, 1280])
        for raw in ("Physical size: 1080x1920", "Physical size: 720x1280\nOverride size: 720x1200", "missing"):
            with self.assertRaises(RuntimeError):
                effective_viewport(raw)


if __name__ == "__main__":
    unittest.main()
