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
from expo_go_intro import intro_sheet
from expo_go_module_intro import ModuleIntro
from observer_framing import decode_observer_line

ROOT = Path(os.environ["ARTIFACT_DIR"])
MODE = sys.argv[1]
PACKAGE = "host.exp.exponent"
EXPO_DISMISSALS = 0
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
    return intro_sheet(tree) or (contains(tree, "Connected to expo-cli") and contains(tree, "SDK version:"))


def native_error_overlay(tree):
    return any(node.attrib.get(key, "").strip().casefold() in ("render error", "uncaught error")
               for node in tree.iter("node") for key in ("text", "content-desc"))


def screenshot(name, allow_expo_sheet=False, allow_native_error=False):
    before = dump(name + "-media-guard")
    if expo_sheet(before) and not allow_expo_sheet:
        raise RuntimeError("Observed Expo sheet covers app; no app PNG retained")
    if native_error_overlay(before) and not allow_native_error:
        raise RuntimeError("Native render-error overlay covers app; no target PNG retained")
    data = adb("exec-out", "screencap", "-p", binary=True)
    after = dump(name + "-post-media-guard")
    if native_error_overlay(after) and not allow_native_error:
        raise RuntimeError("Native render-error overlay appeared during capture; target PNG excluded")
    if expo_sheet(after) and not allow_expo_sheet:
        raise RuntimeError("Observed Expo sheet appeared during capture; app PNG excluded")
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("ADB did not return a PNG")
    (ROOT / (name + ".png")).write_bytes(data)


def capture(name, allow_expo_sheet=False, allow_native_error=False):
    tree = dump(name)
    if expo_sheet(tree) and not allow_expo_sheet:
        raise RuntimeError("Observed Expo sheet covers app; no target screenshot claim")
    if native_error_overlay(tree) and not allow_native_error:
        raise RuntimeError("Native render-error overlay covers app; no target image claim")
    screenshot(name, allow_expo_sheet=allow_expo_sheet, allow_native_error=allow_native_error)
    return tree


def tap_node(node):
    bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
    if not bounds:
        raise RuntimeError("Missing UI bounds")
    x1, y1, x2, y2 = map(int, bounds.groups())
    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(720, x2), min(1280, y2)
    if x2 <= x1 or y2 <= y1:
        raise RuntimeError("UI element is not visible inside the actual viewport")
    adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))


def find(tree, *candidates):
    for candidate in candidates:
        for node in tree.iter("node"):
            if candidate.casefold() in (
                node.attrib.get("text", "") + " " + node.attrib.get("content-desc", "")
            ).casefold():
                return node
    return None


def exact_action(tree, label):
    if native_error_overlay(tree):
        raise RuntimeError("Actual native render-error overlay covers the requested action")
    if expo_sheet(tree):
        raise RuntimeError("Observed Expo developer sheet covers the requested action")
    parents = {child: parent for parent in tree.iter() for child in parent}
    matches = {}
    for node in tree.iter("node"):
        if not any(node.attrib.get(key, "").strip().casefold() == label.casefold()
                   for key in ("text", "content-desc")):
            continue
        action = node
        while action is not None and action.attrib.get("clickable") != "true":
            action = parents.get(action)
        if action is None or action.attrib.get("enabled") != "true":
            continue
        ancestor = action
        disabled = False
        while ancestor is not None:
            if ancestor.attrib.get("enabled") == "false":
                disabled = True
                break
            ancestor = parents.get(ancestor)
        if disabled:
            continue
        bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", action.attrib.get("bounds", ""))
        if bounds:
            x1, y1, x2, y2 = map(int, bounds.groups())
            if min(x2, 720) > max(x1, 0) and min(y2, 1280) > max(y1, 0):
                matches[id(action)] = action
    if len(matches) > 1:
        raise RuntimeError("Ambiguous enabled clickable action: " + label)
    return next(iter(matches.values()), None)


def tap(*candidates, scroll=False):
    for attempt in range(6 if scroll else 1):
        tree = dump()
        for candidate in candidates:
            node = exact_action(tree, candidate)
            if node is not None:
                tap_node(node)
                return
        if scroll:
            adb("shell", "input", "swipe", "360", "1080", "360", "330", "350")
    raise RuntimeError("No observed exact enabled clickable action: " + repr(candidates))


def wait(*candidates, seconds=50, optional=False):
    global EXPO_DISMISSALS
    deadline = time.monotonic() + seconds
    last = None
    while time.monotonic() < deadline:
        try:
            last = dump()
            if intro_sheet(last):
                INTRO.dismiss(last)
                continue
            # The real failed run captured these two labels on Expo's sheet.
            # Close only observed development chrome before evaluating app state.
            if contains(last, "Connected to expo-cli") and contains(last, "SDK version:"):
                EXPO_DISMISSALS += 1
                if EXPO_DISMISSALS > 8:
                    raise RuntimeError("Observed Expo sheet exceeded bounded dismissals")
                capture("observed-expo-developer-sheet-" + str(EXPO_DISMISSALS), allow_expo_sheet=True)
                adb("shell", "input", "keyevent", "KEYCODE_BACK")
                continue
            if native_error_overlay(last):
                capture("actual-render-error", allow_native_error=True)
                raise RuntimeError("Actual native Render Error observed")
            if any(contains(last, target) for target in candidates):
                return last
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
        node = exact_action(tree, label)
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
            capture("failure-" + name, allow_native_error=True)
        except Exception as capture_error:
            observation["capture_error"] = str(capture_error)
    REPORT["cases"].append(observation)
    (ROOT / "retry-primary-observations.json").write_text(json.dumps(REPORT, indent=2))


def begin_recording(name):
    # These cases render reviewed public-only dummy Review/Recovery screens.
    # The original guest recording can establish transient frames only after
    # independent review; no production/transport timing is changed.
    tree = dump()
    if expo_sheet(tree):
        raise RuntimeError("Expo developer sheet covers the recording action")
    remote = "/sdcard/" + name + ".mp4"
    recorder = subprocess.Popen(["adb", "shell", "screenrecord", "--size", "720x1280",
                                 "--bit-rate", "800000", "--time-limit", "8", remote],
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return name, remote, recorder


def finish_recording(recording):
    name, remote, recorder = recording
    try:
        _, error = recorder.communicate(timeout=12)
        status = {"exit": recorder.returncode, "stderr": error.decode("utf-8", "replace"),
                  "transient_state_claim": "Independent original-frame review required"}
        if recorder.returncode == 0:
            adb("pull", remote, str(ROOT / (name + "-original.mp4")))
        (ROOT / (name + "-recording-status.json")).write_text(json.dumps(status, indent=2))
    except subprocess.TimeoutExpired:
        recorder.terminate()
        recorder.communicate(timeout=5)
        (ROOT / (name + "-recording-timeout.txt")).write_text("Recorder did not finish; no video/loading claim")
    finally:
        adb("shell", "rm", "-f", remote, check=False)


def primary_snapshot(name, outcome, submits, reads):
    prefix = "POCKETPAY_RETRY_PRIMARY_NATIVE_OBSERVER"
    records = []
    for line in adb("logcat", "-d", "-s", "ReactNativeJS:I").splitlines():
        if prefix not in line:
            continue
        record = decode_observer_line(line, prefix)
        if record is None:
            continue
        if record.get("sourceSha") != "ddd56649099d1fc5763ef29af3bfba0363897bd6":
            raise RuntimeError("Native primary observer source mismatch")
        counts = record.get("counters", {})
        for key in ("broadcastAttempts", "rpcWrites", "walletSaveAttempts"):
            if counts.get(key) != 0:
                raise RuntimeError("Missing/nonzero primary safety counter: " + key)
        if record.get("outcome") == outcome:
            records.append(record)
    if not records:
        raise RuntimeError("No actual native primary records for outcome: " + outcome)
    state = records[-1]
    counts = state["counters"]
    if (state["submitCalls"], state["readCalls"], counts["submitObserved"], counts["readObserved"]) != (submits, reads, submits, reads):
        raise RuntimeError("Unexpected observed dummy submission/status lookup count")
    if submits and (counts["secretCalls"] != 1 or counts["signingCalls"] < 1):
        raise RuntimeError("Expected one memory dummy secret access and real dummy signing")
    (ROOT / (name + "-native-primary-records.json")).write_text(json.dumps(records, indent=2))
    return state


def retry_outcome(outcome):
    adb("logcat", "-c")
    launch("__payment-retry-attempt-native-fixture?outcome=" + outcome)
    wait("Sign & Send", seconds=300 if outcome == "unknown" else 60)
    capture("retry-" + outcome + "-review")
    submit_recording = begin_recording("retry-" + outcome + "-submit")
    try:
        tap("Sign & Send", scroll=True)
        # Raw immediate screenshot retains the real in-flight renderer if observed.
        time.sleep(0.15)
        screenshot("retry-" + outcome + "-submit-immediate")
        wait("Payment Status Unknown", seconds=60)
        tree = capture("retry-" + outcome + "-unknown")
        if contains(tree, "Sign & Send"):
            raise RuntimeError("Recovery UI unexpectedly offers another submission")
    finally:
        finish_recording(submit_recording)
    before = primary_snapshot("retry-" + outcome + "-before-lookup", outcome, 1, 0)
    if not before["unknownPresent"] or before["phase"] != "unknown" or not re.fullmatch(r"[a-f0-9]{64}", before["unknownHash"] or ""):
        raise RuntimeError("Actual uncertain payment/hash were not observed")
    if before["unknownHash"] != before["transactionHash"]:
        raise RuntimeError("Submitted dummy transaction hash differs from uncertainty identity")
    lookup_recording = begin_recording("retry-" + outcome + "-lookup")
    try:
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
    finally:
        finish_recording(lookup_recording)
    after = primary_snapshot("retry-" + outcome + "-after-lookup", outcome, 1, 1)
    if (not after["unknownPresent"] or after["unknownIdentity"] != before["unknownIdentity"]
            or after["unknownHash"] != before["unknownHash"] or after["phase"] != "unknown"):
        raise RuntimeError("Status lookup changed the uncertain payment identity")
    lookup = after["lastLookup"]
    if lookup["requestedHash"] != before["unknownHash"] or lookup["elapsedMs"] < 1500:
        raise RuntimeError("Expected unchanged delayed read of the actual dummy hash")
    if outcome in ("confirmed", "failed") and (lookup["responseHash"] != before["unknownHash"]
            or lookup["successful"] is not (outcome == "confirmed")):
        raise RuntimeError("Definitive controlled response identity/result mismatch")
    if outcome == "unknown":
        tap("View Payment Details", scroll=True)
        wait("1.25 XLM")
        capture("retry-unknown-details")
        tap("Get Help", scroll=True)
        wait("Never share your secret key", "Payment status help")
        capture("retry-unknown-help")
        tap("OK")
    tap("View Activity" if outcome in ("unknown", "error") else "Done — View Activity", scroll=True)
    wait("No activity yet", seconds=50)
    capture("retry-" + outcome + "-activity")
    final = primary_snapshot("retry-" + outcome + "-activity", outcome, 1, 1)
    if outcome in ("unknown", "error"):
        if (not final["unknownPresent"] or final["unknownIdentity"] != before["unknownIdentity"]
                or final["unknownHash"] != before["unknownHash"]):
            raise RuntimeError("Unresolved Activity navigation lost uncertain payment identity")
    elif final["unknownPresent"]:
        raise RuntimeError("Definitive Done action retained resolved uncertainty")


INTRO = ModuleIntro(globals())

for outcome in ("unknown", "error", "confirmed", "failed"):
    case("retry-" + outcome, lambda outcome=outcome: retry_outcome(outcome))

(ROOT / "retry-primary-observations.json").write_text(json.dumps(REPORT, indent=2))
print(json.dumps(REPORT, indent=2))
sys.exit(0 if len(REPORT["cases"]) == 4 and all(item["result"] == "passed" for item in REPORT["cases"]) else 1)
