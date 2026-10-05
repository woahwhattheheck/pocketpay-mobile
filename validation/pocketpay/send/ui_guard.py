"""Pure native-tree selectors. Importing this module performs no device operation."""
import re
import xml.etree.ElementTree as ET

PACKAGE = "host.exp.exponent"
PERMISSION_PACKAGES = {"com.android.permissioncontroller", "com.google.android.permissioncontroller"}
PUBLIC_RECIPIENT = "GAFVCOWZWSJEAFOKBEBO2B4QITJ2YXN6YIYG6BUURQINVDVW4OPS3OL6"
DESTINATION_LABEL = "Destination Address (Public Key)"
SCAN_ACTION = "Scan QR code for recipient address"
MANUAL_ACTION = "Enter recipient address manually"
UNAVAILABLE = "Camera unavailable"


class UnsafeEnvironment(RuntimeError):
    pass


class UnsafeMedia(UnsafeEnvironment):
    pass


def values(node):
    return [node.get("text", "").strip(), node.get("content-desc", "").strip()]


def contains(tree, text):
    return any(text.casefold() in value.casefold() for node in tree.iter("node") for value in values(node))


def exact_present(tree, text):
    return any(text in values(node) for node in tree.iter("node"))


def bounds(node):
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
    if not match:
        return None
    x1, y1, x2, y2 = map(int, match.groups())
    return (x1, y1, x2, y2) if 0 <= x1 < x2 <= 720 and 0 <= y1 < y2 <= 1280 else None


def parents(tree):
    return {child: parent for parent in tree.iter() for child in parent}


def enabled_chain(node, parent_map):
    if node.get("enabled") != "true" or node.get("visible-to-user") == "false":
        return False
    current = node
    while current is not None:
        if current.get("enabled") == "false" or current.get("visible-to-user") == "false":
            return False
        current = parent_map.get(current)
    return True


def permission_prompt(tree):
    return any(node.get("package") in PERMISSION_PACKAGES for node in tree.iter("node"))


def developer_sheet(tree):
    return contains(tree, "SDK Version") and contains(tree, "Connected to expo-cli") and not permission_prompt(tree)


def guard_xml(xml):
    try:
        tree = ET.fromstring(xml)
    except ET.ParseError as error:
        raise UnsafeEnvironment("Native XML is invalid; safe UI cannot be established") from error
    if (re.search(r"\bS[A-Z2-7]{55}\b", xml) or contains(tree, "Revealed secret key")
            or any(node.get("password") == "true" for node in tree.iter("node"))):
        raise UnsafeMedia("Secret or password UI detected; no XML or image retained")
    return tree


def reject_error(tree):
    errors = ("Something went wrong", "Uncaught Error", "Render Error", "SyntaxError",
              "TypeError:", "Unable to resolve module", "Invalid QR Code", "Secure Storage Inaccessible")
    if any(contains(tree, text) for text in errors):
        raise UnsafeEnvironment("Actual error/alert overlay blocks measurement")
    if contains(tree, "Call Stack") and (contains(tree, "Source") or contains(tree, "Log 1 of")):
        raise UnsafeEnvironment("Actual Expo error overlay blocks measurement")


def product_guard(tree):
    reject_error(tree)
    if developer_sheet(tree):
        raise UnsafeEnvironment("Observed Expo developer sheet covers product UI")
    if permission_prompt(tree):
        raise UnsafeEnvironment("Native permission dialog covers product UI; no permission interaction permitted")
    foreign = {node.get("package") for node in tree.iter("node")
               if node.get("package") and node.get("package") not in
               {PACKAGE, "com.android.systemui", "com.google.android.inputmethod.latin",
                "com.android.inputmethod.latin"}}
    if foreign:
        raise UnsafeEnvironment("Unexpected native package covers the measurement")


def exact_action(tree, label):
    product_guard(tree)
    parent_map = parents(tree)
    matches = {}
    for label_node in tree.iter("node"):
        if label not in values(label_node) or not enabled_chain(label_node, parent_map) or not bounds(label_node):
            continue
        target = label_node
        while target is not None and target.get("clickable") != "true":
            target = parent_map.get(target)
        if (target is not None and target.get("package") == PACKAGE
                and enabled_chain(target, parent_map) and bounds(target)):
            matches[id(target)] = target
    if len(matches) != 1:
        raise RuntimeError("Expected one exact visible enabled clickable action: " + label)
    return next(iter(matches.values()))


def destination_field(tree, expected, initial=False, require_complete_form=True):
    """Unique pinned production placeholder before entry; exact native text thereafter."""
    product_guard(tree)
    if not exact_present(tree, DESTINATION_LABEL) or not exact_present(tree, "Send XLM"):
        raise RuntimeError("Actual Send recipient label/header missing")
    parent_map = parents(tree)
    edit_texts = [node for node in tree.iter("node") if node.get("class") == "android.widget.EditText"]
    if require_complete_form and len(edit_texts) != 3:
        raise RuntimeError("Expected the actual three-field Send form")
    eligible = [node for node in edit_texts if node.get("package") == PACKAGE
                and node.get("clickable") == "true" and node.get("focusable") == "true"
                and enabled_chain(node, parent_map) and bounds(node) and node.get("password") != "true"]
    if require_complete_form and len(eligible) != 3:
        raise RuntimeError("Send field is disabled, clipped, hidden or not editable")
    if initial:
        matches = [node for node in eligible if node.get("text", "") in {"", "G..."}
                   and node.get("hint", "") in {"", "G..."}
                   and "G..." in {node.get("text", ""), node.get("hint", "")}]
    else:
        matches = [node for node in eligible if node.get("text", "") == expected]
    if len(matches) != 1:
        raise RuntimeError("Recipient native value/placeholder is not unique and exact")
    recipient = matches[0]
    other_values = {node.get("text", "") or node.get("hint", "") for node in eligible if node is not recipient}
    if require_complete_form and other_values != {"0.00", "Payment reference"}:
        raise RuntimeError("Amount or memo changed; measurement cannot enter payment flow")
    # Prefer structural association when the compressed tree preserves the form
    # container. Otherwise the unique G... placeholder is pinned to Send source;
    # subsequent observations use its exact native entered value and stable bounds.
    labels = [node for node in tree.iter("node") if DESTINATION_LABEL in values(node)]
    association = "unique-production-placeholder-and-exact-native-value"
    for label in labels:
        ancestor = parent_map.get(label)
        while ancestor is not None:
            fields = [node for node in ancestor.iter("node") if node.get("class") == "android.widget.EditText"]
            if fields:
                if len(fields) == 1:
                    if fields[0] is not recipient:
                        raise RuntimeError("Recipient label belongs to another native field")
                    association = "exact-label-and-unique-form-ancestor"
                break
            ancestor = parent_map.get(ancestor)
    return recipient, association


def ime_visible(text):
    # API34 InputMethodManager exposes these booleans; ambiguous/missing state
    # never authorizes BACK, which could otherwise navigate away from Send.
    values_found = re.findall(r"\b(?:mInputShown|isInputViewShown)=(true|false)\b", text)
    if not values_found or len(set(values_found)) != 1:
        raise UnsafeEnvironment("Native IME visibility is missing or ambiguous")
    return values_found[0] == "true"


def effective_viewport(raw):
    physical = re.findall(r"Physical size:\s*(\d+)x(\d+)\b", raw)
    override = re.findall(r"Override size:\s*(\d+)x(\d+)\b", raw)
    if len(physical) != 1 or len(override) > 1:
        raise UnsafeEnvironment("Actual native viewport is missing or ambiguous")
    effective = override[0] if override else physical[0]
    if effective != ("720", "1280"):
        raise UnsafeEnvironment("Effective viewport differs from reviewed 720x1280 bounds")
    return {"physical": list(physical[0]), "override": list(override[0]) if override else None,
            "effective": [720, 1280]}
