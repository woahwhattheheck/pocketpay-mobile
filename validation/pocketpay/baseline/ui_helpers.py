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
    try:
        xml = adb("exec-out", "cat", remote)
    finally:
        adb("shell", "rm", "-f", remote, check=False)
    if "revealed secret key" in xml.casefold() or re.search(r"\bS[A-Z2-7]{55}\b", xml):
        raise RuntimeError("Unsafe secret UI observed; no media retained")
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


def expo_sheet(tree):
    return contains(tree, "Connected to expo-cli") and contains(tree, "SDK version:")


def native_error(tree):
    titles = {"render error", "uncaught error"}
    return any(node.attrib.get(key, "").strip().casefold() in titles
               for node in tree.iter("node") for key in ("text", "content-desc"))


def failure_capture(name):
    return name.startswith("failure-") or name in ("actual-render-error", "unmatched-state")


def screenshot(name, allow_expo_sheet=False):
    tree = dump(name + "-media-guard")
    if expo_sheet(tree) and not allow_expo_sheet:
        raise RuntimeError("Expo developer sheet covers app UI; no app capture claim")
    if native_error(tree) and not failure_capture(name):
        raise RuntimeError("Actual native error covers app UI; no app capture claim")
    data = adb("exec-out", "screencap", "-p", binary=True)
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("ADB did not return a PNG")
    (ROOT / (name + ".png")).write_bytes(data)


def capture(name, allow_expo_sheet=False):
    tree = dump(name)
    if expo_sheet(tree) and not allow_expo_sheet:
        raise RuntimeError("Expo developer sheet covers app UI; no app capture claim")
    if native_error(tree) and not failure_capture(name):
        raise RuntimeError("Actual native error covers app UI; no app capture claim")
    screenshot(name, allow_expo_sheet=allow_expo_sheet)
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


def find_action(tree, *candidates, lowest=False):
    """Find a real enabled native action, never an enabled child of a disabled button."""
    if expo_sheet(tree):
        raise RuntimeError("Expo developer sheet covers app UI; hidden actions are rejected")
    if native_error(tree):
        raise RuntimeError("Actual native error covers app UI; hidden actions are rejected")
    parents = {child: parent for parent in tree.iter() for child in parent}
    for candidate in candidates:
        actions = {}
        for node in tree.iter("node"):
            values = [node.attrib.get(key, "").strip().casefold()
                      for key in ("text", "content-desc")]
            if candidate.casefold() not in values:
                continue
            chain = []
            current = node
            while current is not None:
                chain.append(current)
                current = parents.get(current)
            if any(item.attrib.get("enabled") == "false" for item in chain):
                continue
            action = next((item for item in chain
                           if item.attrib.get("clickable") == "true"
                           and item.attrib.get("enabled") == "true"), None)
            if action is None:
                continue
            match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",
                                 action.attrib.get("bounds", ""))
            if match:
                x1, y1, x2, y2 = map(int, match.groups())
                if 0 <= x1 < x2 <= 720 and 0 <= y1 < y2 <= 1280:
                    actions[(x1, y1, x2, y2)] = action
        if actions:
            if len(actions) != 1 and not lowest:
                raise RuntimeError("Ambiguous enabled native action: " + candidate)
            if lowest:
                return max(actions.items(), key=lambda item: item[0][3])[1]
            return next(iter(actions.values()))
    return None


def tap(*candidates, scroll=False):
    for attempt in range(4 if scroll else 1):
        tree = dump()
        node = find_action(tree, *candidates)
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
            # These exact labels were observed in the failed hosted capture.
            # Back closes only Expo's developer sheet; never guess an app action.
            if expo_sheet(last):
                capture("observed-expo-developer-sheet", allow_expo_sheet=True)
                adb("shell", "input", "keyevent", "KEYCODE_BACK")
                continue
            if native_error(last):
                raise RuntimeError("Actual native render error observed")
            if any(contains(last, target) for target in candidates):
                return last
        except (subprocess.SubprocessError, ET.ParseError):
            pass
        time.sleep(0.4)
    if optional:
        return None
    capture("unmatched-state")
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
        if expo_sheet(tree):
            capture("observed-expo-developer-sheet", allow_expo_sheet=True)
            adb("shell", "input", "keyevent", "KEYCODE_BACK")
            continue
        node = find_action(tree, label)
        if node is not None:
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
