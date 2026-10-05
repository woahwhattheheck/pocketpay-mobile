"""Measure actual emulator UI; never creates images or replaces product screens."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(os.environ["ARTIFACT_DIR"])
MODE = sys.argv[1]
PACKAGE = "host.exp.exponent"
REPORT = {
    "mode": MODE,
    "source_sha": os.environ["SOURCE_SHA"],
    "camera_mocked": False,
    "retry_store_and_horizon_transport_controlled": MODE == "retry",
    "live_payment_transport": False,
    "cases": [],
    "optional_observations": [],
}


def adb(*args, binary=False, check=True, timeout=30):
    result = subprocess.run(
        ["adb", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=timeout, check=check,
    )
    return result.stdout if binary else result.stdout.decode("utf-8", "replace")


def dump(name="current"):
    remote = "/sdcard/pocketpay-ui.xml"
    adb("shell", "uiautomator", "dump", "--compressed", remote, timeout=20)
    xml = adb("exec-out", "cat", remote)
    (ROOT / (name + ".xml")).write_text(xml)
    return ET.fromstring(xml)


def labels(tree):
    return [
        (node.attrib.get("text", "") + " " + node.attrib.get("content-desc", "")).strip()
        for node in tree.iter("node")
    ]


def contains(tree, label):
    target = label.casefold()
    return any(target in value.casefold() for value in labels(tree))


def screenshot(name):
    data = adb("exec-out", "screencap", "-p", binary=True)
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("ADB did not return a PNG")
    (ROOT / (name + ".png")).write_bytes(data)


def capture(name):
    tree = dump(name)
    screenshot(name)
    return tree


def tap_node(node):
    bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
    if not bounds:
        raise RuntimeError("Missing UI bounds")
    x1, y1, x2, y2 = map(int, bounds.groups())
    if x2 <= x1 or y2 <= y1:
        raise RuntimeError("UI element is not visible")
    adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))


def find(tree, *candidates):
    for candidate in candidates:
        for node in tree.iter("node"):
            if candidate.casefold() in (
                node.attrib.get("text", "") + " " + node.attrib.get("content-desc", "")
            ).casefold():
                return node
    return None


def tap(*candidates, scroll=False):
    for attempt in range(4 if scroll else 1):
        tree = dump()
        node = find(tree, *candidates)
        if node is not None:
            tap_node(node)
            return
        if scroll:
            adb("shell", "input", "swipe", "360", "1080", "360", "330", "350")
    raise RuntimeError("No visible UI action: " + repr(candidates))


def wait(*candidates, seconds=50, optional=False):
    deadline = time.monotonic() + seconds
    last = None
    while time.monotonic() < deadline:
        try:
            last = dump()
            if any(contains(last, target) for target in candidates):
                return last
            # Dismiss only observed Expo introductory chrome/environment dialogs.
            chrome = find(last, "Got it", "Continue", "Wait")
            if chrome is not None:
                tap_node(chrome)
        except (subprocess.SubprocessError, ET.ParseError):
            pass
        time.sleep(0.4)
    if optional:
        return None
    screenshot("unmatched-state")
    if last is not None:
        (ROOT / "unmatched-labels.json").write_text(json.dumps(labels(last), indent=2))
    raise RuntimeError("Expected actual UI state did not appear: " + repr(candidates))


def launch(route):
    adb("shell", "am", "force-stop", PACKAGE)
    url = "exp://127.0.0.1:8081/--/" + route
    output = adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
                 "-d", shlex.quote(url), "-p", PACKAGE)
    with (ROOT / "launches.txt").open("a") as stream:
        stream.write(output + "\n")


def wait_enabled_action(label, seconds=50):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        tree = dump()
        node = find(tree, label)
        if node is not None and node.attrib.get("enabled") == "true":
            return tree
        time.sleep(0.4)
    raise RuntimeError("Expected enabled action after lookup: " + label)


def case(name, callback):
    observation = {"name": name, "result": "failed"}
    try:
        callback()
        observation["result"] = "passed"
    except Exception as error:
        observation["error"] = str(error)
        try:
            capture("failure-" + name)
        except Exception as capture_error:
            observation["capture_error"] = str(capture_error)
    REPORT["cases"].append(observation)
    (ROOT / "observations.json").write_text(json.dumps(REPORT, indent=2))


def camera_denied_manual():
    # Fresh app permission state, real OS request/deny, then production fallback.
    adb("shell", "pm", "revoke", PACKAGE, "android.permission.CAMERA", check=False)
    adb("shell", "pm", "clear-permission-flags", PACKAGE, "android.permission.CAMERA",
        "user-set", "user-fixed", check=False)
    launch("__camera-native-fixture?screen=scan")
    wait("Camera Permission Required", seconds=300)
    capture("camera-initial-permission-required")
    tap("Request camera permission", "Request Camera Permission")
    wait("Don't allow", "Don’t allow")
    capture("camera-real-os-permission-dialog")
    tap("Don't allow", "Don’t allow")
    wait("Camera Permission Required")
    capture("camera-permission-denied")
    tap("Enter recipient address manually", "Enter Address Manually")
    wait("Send XLM", "Recipient", seconds=40)
    capture("camera-denied-manual-entry")


def camera_unavailable_manual():
    # Grant through the actual OS dialog; front/back emulator hardware is absent.
    launch("__camera-native-fixture?screen=scan")
    wait("Camera Permission Required")
    tap("Request camera permission", "Request Camera Permission")
    wait("While using the app", "Only this time")
    capture("camera-real-os-grant-dialog")
    tap("While using the app", "Only this time")
    wait("Camera Unavailable", seconds=60)
    capture("camera-hardware-unavailable")
    tap("Enter recipient address manually", "Enter Address Manually")
    wait("Send XLM", "Recipient")
    capture("camera-unavailable-manual-entry")


def contacts_unavailable_manual():
    launch("__camera-native-fixture?screen=contacts")
    wait("Scan QR", seconds=60)
    tap("Scan QR code to add contact", "Scan QR")
    wait("Camera unavailable", seconds=60)
    capture("contacts-camera-unavailable")
    tap("Enter recipient address manually", "Enter Address Manually")
    wait("Contact name", "Save Contact", seconds=40)
    capture("contacts-manual-entry")


def retry_outcome(outcome):
    launch("__payment-retry-attempt-native-fixture?outcome=" + outcome)
    wait("Sign & Send", seconds=300 if outcome == "unknown" else 60)
    capture("retry-" + outcome + "-review")
    tap("Sign & Send", scroll=True)
    # Raw immediate screenshot retains the real in-flight renderer if observed.
    time.sleep(0.15)
    screenshot("retry-" + outcome + "-submit-immediate")
    wait("Payment Status Unknown", seconds=60)
    tree = capture("retry-" + outcome + "-unknown")
    if contains(tree, "Sign & Send"):
        raise RuntimeError("Recovery UI unexpectedly offers another submission")
    tap("Check Status", scroll=True)
    time.sleep(0.15)
    screenshot("retry-" + outcome + "-lookup-immediate")
    target = {
        "unknown": "Check Status",
        "error": "Could not check the payment status",
        "confirmed": "Payment Confirmed",
        "failed": "Payment Not Completed",
    }[outcome]
    if outcome == "unknown":
        wait_enabled_action(target)
    else:
        wait(target, seconds=50)
    tree = capture("retry-" + outcome + "-lookup-result")
    if contains(tree, "Sign & Send"):
        raise RuntimeError("Lookup result unexpectedly offers another submission")
    if outcome == "unknown":
        tap("View Payment Details", scroll=True)
        wait("1.25 XLM")
        capture("retry-unknown-details")
        tap("Get Help", scroll=True)
        wait("Never share your secret key", "Payment status help")
        capture("retry-unknown-help")
        tap("OK")
        tap("View Activity", scroll=True)
        wait("No activity yet", "All", seconds=50)
        capture("retry-unknown-activity")


if MODE == "camera":
    case("scan-denied-manual", camera_denied_manual)
    case("scan-unavailable-manual", camera_unavailable_manual)
    case("contacts-unavailable-manual", contacts_unavailable_manual)
    REPORT["optional_observations"].append({
        "name": "transient-loading",
        "result": "not asserted; only retained raw images may establish observation",
    })
else:
    for outcome in ("unknown", "error", "confirmed", "failed"):
        case("retry-" + outcome, lambda outcome=outcome: retry_outcome(outcome))

(ROOT / "observations.json").write_text(json.dumps(REPORT, indent=2))
print(json.dumps(REPORT, indent=2))
sys.exit(0 if all(item["result"] == "passed" for item in REPORT["cases"]) else 1)
