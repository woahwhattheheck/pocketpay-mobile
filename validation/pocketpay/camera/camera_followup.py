"""Later coordinated native execution only; preparing/importing this file runs no ADB."""
import argparse
import json
from pathlib import Path
import re
import shlex
import subprocess
import time
import xml.etree.ElementTree as ET

from verify_checkout import SOURCE_SHA, SOURCE_TREE, verify

PACKAGE = "host.exp.exponent"
PERMISSION = "android.permission.CAMERA"
PERMISSION_PACKAGES = {"com.android.permissioncontroller", "com.google.android.permissioncontroller"}
MANUAL = "Enter recipient address manually"
REQUEST = "Request camera permission"
BLOCKED_SCAN = "Camera access is blocked. Enable it in your device settings, or enter the recipient address manually."
BLOCKED_CONTACTS = "Please enable camera access in your device settings, then try again."
LOADING = "Checking camera permission…"


class UnsafeMedia(RuntimeError):
    pass


def developer_sheet(tree):
    return (contains(tree, "SDK Version") and contains(tree, "Connected to expo-cli")
            and not permission_prompt(tree))


def permission_prompt(tree):
    return any(node.get("package") in PERMISSION_PACKAGES and
               node.get("resource-id", "").endswith(":id/permission_deny_button")
               for node in tree.iter("node"))


def values(node):
    return [node.get("text", "").strip(), node.get("content-desc", "").strip()]


def contains(tree, text):
    return any(text.casefold() in value.casefold()
               for node in tree.iter("node") for value in values(node))


def bounds(node):
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
    if not match:
        return None
    x1, y1, x2, y2 = map(int, match.groups())
    return (x1, y1, x2, y2) if 0 <= x1 < x2 <= 720 and 0 <= y1 < y2 <= 1280 else None


def exact_action(tree, label, packages=None, resource_suffix=None):
    matches = []
    parents = {child: parent for parent in tree.iter() for child in parent}
    for node in tree.iter("node"):
        if node.get("enabled") != "true" or node.get("clickable") != "true" or not bounds(node):
            continue
        if packages is not None and node.get("package") not in packages:
            continue
        ancestor = parents.get(node)
        disabled = False
        while ancestor is not None:
            if ancestor.get("enabled") == "false":
                disabled = True
                break
            ancestor = parents.get(ancestor)
        if disabled:
            continue
        by_label = any(value.casefold() == label.casefold() for value in values(node))
        by_id = resource_suffix and node.get("resource-id", "").endswith(resource_suffix)
        if by_label or by_id:
            matches.append(node)
    if len(matches) != 1:
        raise RuntimeError("Expected one exact enabled action: " + label)
    return matches[0]


def guard_xml(xml):
    tree = ET.fromstring(xml)
    if re.search(r"\bS[A-Z2-7]{55}\b", xml) or contains(tree, "Revealed secret key"):
        raise UnsafeMedia("Secret UI detected; no XML or image retained")
    return tree


class Controller:
    def __init__(self, serial, output, checkout, suite):
        self.serial = serial
        self.output = output
        self.deadline = time.monotonic() + 600
        self.developer_sheet_dismissals = 0
        self.reject_post_denial_prompt = False
        self.suite = suite
        self.loading = {"scan": [], "contacts": []}
        self.report = {
            "sourceSha": SOURCE_SHA, "sourceTree": SOURCE_TREE,
            "cameraMocked": False, "permissionHookMocked": False,
            "productionFilesUnchanged": True, "nativeExecution": True,
            "suite": suite,
            "cameraPacketReadinessRequiresBothSuites": True,
            "loadingClaimRequiresActualFrame": True, "cases": [],
        }
        self.report["provenance"] = verify(checkout, require_installed=True)

    def adb(self, *arguments, binary=False):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("Bounded camera controller exceeded 600 seconds")
        result = subprocess.run(["adb", "-s", self.serial, *arguments],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                check=True, timeout=min(12, remaining))
        return result.stdout if binary else result.stdout.decode("utf-8", "replace")

    def dump(self):
        remote = "/sdcard/pocketpay-followup-camera-ui.xml"
        try:
            self.adb("shell", "uiautomator", "dump", "--compressed", remote)
            xml = self.adb("exec-out", "cat", remote)
        finally:
            # Remove only the controller's transient XML, including unsafe UI.
            self.adb("shell", "rm", "-f", remote)
        return guard_xml(xml), xml

    def capture(self, name, required=(), action=None, allow_developer_sheet=False,
                allow_permission_prompt=False):
        before, xml = self.dump()
        if developer_sheet(before) and not allow_developer_sheet:
            raise RuntimeError("Observed Expo developer sheet must be dismissed before capture")
        if self.reject_post_denial_prompt and permission_prompt(before) and not allow_permission_prompt:
            self.unexpected_prompt()
        native_action_capture = action and action[1] == PERMISSION_PACKAGES
        if permission_prompt(before) and not (allow_permission_prompt or native_action_capture):
            raise RuntimeError("Native permission dialog blocks product/loading capture")
        if any(not contains(before, text) for text in required):
            raise RuntimeError("Required actual UI missing before capture: " + name)
        if action:
            exact_action(before, *action)
        png = self.adb("exec-out", "screencap", "-p", binary=True)
        if not png.startswith(b"\x89PNG\r\n\x1a\n"):
            raise RuntimeError("Native screenshot was not PNG")
        after, after_xml = self.dump()
        if developer_sheet(after) and not allow_developer_sheet:
            raise RuntimeError("Expo developer sheet appeared during capture; no media retained")
        if self.reject_post_denial_prompt and permission_prompt(after) and not allow_permission_prompt:
            self.unexpected_prompt()
        if permission_prompt(after) and not (allow_permission_prompt or native_action_capture):
            raise RuntimeError("Native permission dialog appeared during product/loading capture")
        if any(not contains(after, text) for text in required):
            # A transient state changed during capture; do not label the PNG as
            # that state or claim its manual fallback was exercised.
            return False
        if action:
            exact_action(after, *action)
        (self.output / (name + ".xml")).write_text(xml)
        (self.output / (name + "-after.xml")).write_text(after_xml)
        (self.output / (name + ".png")).write_bytes(png)
        return True

    def tap(self, tree, label, packages=None, resource_suffix=None):
        if developer_sheet(tree):
            raise RuntimeError("No product or permission tap through an observed Expo developer sheet")
        tree, _ = self.dump()
        if developer_sheet(tree):
            raise RuntimeError("Expo developer sheet appeared before tap")
        if self.reject_post_denial_prompt and permission_prompt(tree):
            self.unexpected_prompt()
        if permission_prompt(tree) and packages != PERMISSION_PACKAGES:
            raise RuntimeError("Native permission dialog blocks product tap")
        node = exact_action(tree, label, packages, resource_suffix)
        x1, y1, x2, y2 = bounds(node)
        self.adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))

    def wait(self, text, seconds=35, scope=None):
        until = min(self.deadline, time.monotonic() + seconds)
        while time.monotonic() < until:
            tree, _ = self.dump()
            if developer_sheet(tree):
                if self.developer_sheet_dismissals >= 2:
                    raise RuntimeError("Expo developer sheet exceeded bounded observed dismissals")
                name = "observed-expo-dev-sheet-" + str(self.developer_sheet_dismissals + 1)
                if self.capture(name, ("SDK Version", "Connected to expo-cli"), allow_developer_sheet=True):
                    current, _ = self.dump()
                    if developer_sheet(current):
                        self.developer_sheet_dismissals += 1
                        self.adb("shell", "input", "keyevent", "KEYCODE_BACK")
                continue
            if self.reject_post_denial_prompt and permission_prompt(tree):
                self.unexpected_prompt()
            if permission_prompt(tree):
                raise RuntimeError("Native permission dialog blocks product/loading acceptance")
            if scope and not self.loading[scope] and contains(tree, LOADING):
                name = scope + "-actual-permission-loading"
                if self.capture(name, (LOADING, MANUAL)):
                    self.loading[scope].append(name)
            if contains(tree, text):
                return tree
            # No guessed chrome dismissal, arbitrary consent taps or product actions.
            time.sleep(0.2)
        raise RuntimeError("Actual UI state not observed within bound: " + text)

    def wait_action(self, label, packages, resource_suffix, seconds=25):
        until = min(self.deadline, time.monotonic() + seconds)
        while time.monotonic() < until:
            tree, _ = self.dump()
            if developer_sheet(tree):
                raise RuntimeError("Observed Expo developer sheet blocks native permission action")
            if self.reject_post_denial_prompt and permission_prompt(tree):
                self.unexpected_prompt()
            try:
                exact_action(tree, label, packages, resource_suffix)
                return tree
            except RuntimeError:
                time.sleep(0.2)
        raise RuntimeError("Actual scoped native action not observed: " + label)

    def unexpected_prompt(self):
        deny = ("Don't allow", PERMISSION_PACKAGES, ":id/permission_deny_button")
        retained = self.capture("unexpected-native-prompt-after-one-denial", action=deny,
                                allow_permission_prompt=True)
        text = self.adb("shell", "dumpsys", "package", PACKAGE)
        lines = [line.strip() for line in text.splitlines() if PERMISSION in line and "granted=" in line]
        (self.output / "unexpected-prompt-native-camera-flags.txt").write_text("\n".join(lines) + "\n")
        self.report["unexpectedPromptAfterSingleDenial"] = {
            "observed": True, "nativeFrameRetained": retained,
            "furtherPermissionInteraction": False,
            "limit": "A dialog was present after the single denial; no additional deny/grant is performed.",
        }
        raise RuntimeError("Unexpected native CAMERA prompt after one denial; retained as failure without interaction")

    def launch(self, screen):
        self.adb("shell", "am", "force-stop", PACKAGE)
        url = "exp://127.0.0.1:8081/--/send/__camera-native-fixture?screen=" + screen
        output = self.adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
                          "-d", shlex.quote(url), "-p", PACKAGE)
        with (self.output / "launches.txt").open("a") as stream:
            stream.write(output + "\n")

    def permission_snapshot(self, name, fixed=False, granted=False):
        text = self.adb("shell", "dumpsys", "package", PACKAGE)
        lines = [line.strip() for line in text.splitlines() if PERMISSION in line and "granted=" in line]
        expected = "granted=true" if granted else "granted=false"
        if len(lines) != 1 or expected not in lines[0]:
            raise RuntimeError("Expected native CAMERA permission state was not established")
        if fixed and ("USER_FIXED" not in lines[0] or "USER_SET" not in lines[0]):
            raise RuntimeError("Native CAMERA user-fixed flags were not established")
        (self.output / (name + "-native-permission.txt")).write_text(lines[0] + "\n")

    def fallback(self, tree, name, contacts=False):
        self.tap(tree, MANUAL, {PACKAGE})
        expected = "Add New Contact" if contacts else "Send XLM"
        settled = self.wait(expected)
        if contains(settled, "Camera Permission Required") or contains(settled, BLOCKED_CONTACTS):
            raise RuntimeError("Manual fallback did not dismiss the scanner")
        fields = [node for node in settled.iter("node")
                  if node.get("class", "").endswith("EditText") and node.get("enabled") == "true"]
        if not fields:
            raise RuntimeError("Actual manual fallback has no editable native input")
        if not self.capture(name, (expected,)):
            raise RuntimeError("Manual fallback changed while retaining evidence")
        # No text, QR code, secret, contact save, review, payment or clipboard input.

    def denied_manual(self):
        self.adb("shell", "am", "force-stop", PACKAGE)
        self.adb("shell", "pm", "revoke", PACKAGE, PERMISSION)
        self.adb("shell", "pm", "clear-permission-flags", PACKAGE, PERMISSION, "user-set", "user-fixed")
        self.launch("scan")
        tree = self.wait("Camera Permission Required", seconds=90, scope="scan")
        if contains(tree, BLOCKED_SCAN):
            raise RuntimeError("Fresh Expo Go permission-request cache precondition failed")
        self.tap(tree, REQUEST, {PACKAGE})
        deny = ("Don't allow", PERMISSION_PACKAGES, ":id/permission_deny_button")
        tree = self.wait_action(*deny)
        if not self.capture("scan-actual-os-deny-dialog", action=deny):
            raise RuntimeError("Native permission dialog changed before evidence")
        tree, _ = self.dump()
        self.tap(tree, *deny)
        self.reject_post_denial_prompt = True
        tree = self.wait("Camera Permission Required")
        self.permission_snapshot("scan-denied", fixed=False)
        if contains(tree, BLOCKED_SCAN):
            raise RuntimeError("First native denial already hard-blocked; canAskAgain case not established")
        exact_action(tree, REQUEST, {PACKAGE})
        if not self.capture("scan-real-permission-denied", ("Camera Permission Required", MANUAL)):
            raise RuntimeError("Denied state changed before evidence")
        tree, _ = self.dump()
        self.fallback(tree, "scan-denied-manual-entry")

    def unavailable_manual(self):
        # The observed first denial remains askable; actual OS grant drives the
        # unchanged CameraView. Missing emulator camera hardware is an external
        # guest prerequisite, not a hook, response or component mock.
        self.reject_post_denial_prompt = False
        self.launch("scan")
        tree = self.wait("Camera Permission Required", scope="scan")
        self.tap(tree, REQUEST, {PACKAGE})
        allow = ("While using the app", PERMISSION_PACKAGES,
                 ":id/permission_allow_foreground_only_button")
        tree = self.wait_action(*allow)
        if not self.capture("scan-actual-os-grant-dialog", action=allow):
            raise RuntimeError("Native grant dialog changed before evidence")
        tree, _ = self.dump()
        self.tap(tree, *allow)
        tree = self.wait("Camera Unavailable", seconds=45, scope="scan")
        self.permission_snapshot("scan-unavailable", granted=True)
        if not self.capture("scan-real-camera-unavailable", ("Camera Unavailable", MANUAL)):
            raise RuntimeError("Actual mount-error state changed before evidence")
        tree, _ = self.dump()
        self.fallback(tree, "scan-unavailable-manual-entry")

    def contacts_unavailable_manual(self):
        self.permission_snapshot("contacts-unavailable", granted=True)
        self.launch("contacts")
        tree = self.wait("Scan QR", scope="contacts")
        self.tap(tree, "Scan QR code to add contact", {PACKAGE})
        tree = self.wait("Camera unavailable", seconds=45, scope="contacts")
        if not self.capture("contacts-real-camera-unavailable", ("Camera unavailable", MANUAL)):
            raise RuntimeError("Actual Contacts mount-error state changed before evidence")
        tree, _ = self.dump()
        self.fallback(tree, "contacts-unavailable-manual-entry", contacts=True)

    def user_fixed_manual(self):
        # Run only after the successful real request/denial above establishes
        # Expo's asked cache. Permission flags alone do not prove SDK response.
        self.adb("shell", "am", "force-stop", PACKAGE)
        self.adb("shell", "pm", "revoke", PACKAGE, PERMISSION)
        self.adb("shell", "pm", "set-permission-flags", PACKAGE, PERMISSION, "user-set", "user-fixed")
        self.permission_snapshot("user-fixed", fixed=True)
        self.launch("scan")
        tree = self.wait(BLOCKED_SCAN, scope="scan")
        if contains(tree, REQUEST) or contains(tree, "Request Camera Permission"):
            raise RuntimeError("Blocked Scan unexpectedly offers a request action")
        if not self.capture("scan-real-user-fixed", (BLOCKED_SCAN, MANUAL)):
            raise RuntimeError("User-fixed Scan state changed before evidence")
        tree, _ = self.dump()
        self.fallback(tree, "scan-user-fixed-manual-entry")

    def contacts_user_fixed_manual(self):
        self.permission_snapshot("contacts-user-fixed", fixed=True)
        self.launch("contacts")
        tree = self.wait("Scan QR", scope="contacts")
        self.tap(tree, "Scan QR code to add contact", {PACKAGE})
        tree = self.wait(BLOCKED_CONTACTS, scope="contacts")
        if contains(tree, "Grant camera permission") or contains(tree, "Grant Permission"):
            raise RuntimeError("Blocked Contacts scanner unexpectedly offers a grant action")
        if not self.capture("contacts-real-user-fixed", (BLOCKED_CONTACTS, MANUAL)):
            raise RuntimeError("User-fixed Contacts state changed before evidence")
        tree, _ = self.dump()
        self.fallback(tree, "contacts-user-fixed-manual-entry", contacts=True)

    def contacts_first_denial_manual(self):
        # A separate fresh-data suite measures the QrScanner re-request risk.
        # This suite clears only CAMERA flags, never the SDK's asked cache.
        self.adb("shell", "am", "force-stop", PACKAGE)
        self.adb("shell", "pm", "revoke", PACKAGE, PERMISSION)
        self.adb("shell", "pm", "clear-permission-flags", PACKAGE, PERMISSION, "user-set", "user-fixed")
        self.launch("contacts")
        tree = self.wait("Scan QR", seconds=90)
        self.tap(tree, "Scan QR code to add contact", {PACKAGE})
        deny = ("Don't allow", PERMISSION_PACKAGES, ":id/permission_deny_button")
        self.wait_action(*deny)
        if not self.capture("contacts-actual-first-os-deny-dialog", action=deny):
            raise RuntimeError("Contacts first native dialog changed before evidence")
        tree, _ = self.dump()
        self.tap(tree, *deny)
        self.reject_post_denial_prompt = True
        tree = self.wait("Camera access is required to scan QR codes.", scope="contacts")
        if contains(tree, BLOCKED_CONTACTS):
            self.capture("contacts-first-denial-hard-block-substitution", (BLOCKED_CONTACTS,))
            self.permission_snapshot("contacts-first-denial-hard-block", fixed=False)
            raise RuntimeError("Hard-blocked Contacts is not an ordinary canAskAgain first-denial observation")
        exact_action(tree, "Grant camera permission", {PACKAGE})
        if not self.capture("contacts-first-denial-askable-guidance", ("Grant camera permission", MANUAL)):
            raise RuntimeError("Contacts ordinary denied guidance did not remain observable")
        self.permission_snapshot("contacts-first-denial", fixed=False)
        tree, _ = self.dump()
        self.fallback(tree, "contacts-first-denial-manual-entry", contacts=True)

    def run(self):
        if self.adb("shell", "getprop", "ro.build.version.sdk").strip() != "34":
            raise RuntimeError("This controller requires the reviewed Android API34 guest")
        viewport = self.adb("shell", "wm", "size")
        sizes = re.findall(r"(?:Physical|Override) size:\s*(\d+x\d+)", viewport)
        if not sizes or sizes[-1] != "720x1280":
            raise RuntimeError("Require actual 720x1280 guest viewport for bounded observed targets")
        (self.output / "native-viewport.txt").write_text(viewport)
        package_metadata = self.adb("shell", "dumpsys", "package", PACKAGE)
        if not re.search(r"\bversionName=54\.0\.8\b", package_metadata):
            raise RuntimeError("This controller requires the reviewed Expo Go54.0.8 guest")
        (self.output / "expo-go-package.txt").write_text(package_metadata)
        cases = (("contacts-ordinary-first-denial-manual", self.contacts_first_denial_manual),) if self.suite == "contacts-first-denial" else (
                               ("scan-denied-manual", self.denied_manual),
                               ("scan-unavailable-manual", self.unavailable_manual),
                               ("contacts-unavailable-manual", self.contacts_unavailable_manual),
                               ("scan-user-fixed-manual", self.user_fixed_manual),
                               ("contacts-user-fixed-manual", self.contacts_user_fixed_manual))
        for name, callback in cases:
            result = {"name": name, "result": "failed"}
            try:
                callback()
                result["result"] = "passed"
            except Exception as error:
                result["error"] = str(error)
                self.report["cases"].append(result)
                # Never take an unguarded failure image or continue after a
                # failed permission-cache or media-safety precondition.
                break
            self.report["cases"].append(result)
        self.report["loadingObservations"] = [
            {"screen": screen, "result": "observed" if files else "not_observed",
             "retainedFrameNames": files, "loadingFallbackExercised": False,
             "limit": "No SDK delay or mock; only matching before/after XML with a native PNG qualifies."}
            for screen, files in self.loading.items()
        ]
        self.report["developerSheetDismissals"] = self.developer_sheet_dismissals
        self.report["passed"] = len(self.report["cases"]) == len(cases) and all(
            item["result"] == "passed" for item in self.report["cases"])
        (self.output / "observations.json").write_text(json.dumps(self.report, indent=2) + "\n")
        return 0 if self.report["passed"] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--artifacts", required=True, type=Path)
    parser.add_argument("--source-checkout", required=True, type=Path)
    parser.add_argument("--suite", choices=("primary-and-user-fixed", "contacts-first-denial"), required=True)
    parser.add_argument("--fresh-data-receipt", required=True, type=Path)
    args = parser.parse_args()
    if args.artifacts.exists() and any(args.artifacts.iterdir()):
        raise SystemExit("Refuse to overwrite existing native evidence")
    args.artifacts.mkdir(parents=True, exist_ok=True)
    try:
        receipt = args.fresh_data_receipt.read_text()
        if receipt.strip() != "Success":
            raise RuntimeError("Require the coordinator's successful disposable Expo Go data-reset receipt")
        (args.artifacts / "guest-only-fresh-data-reset.txt").write_text(receipt)
        controller = Controller(args.serial, args.artifacts, args.source_checkout, args.suite)
        reversed_ports = controller.adb("reverse", "--list")
        if not any("tcp:8081 tcp:8081" in line for line in reversed_ports.splitlines()):
            raise RuntimeError("The actual guest Metro reverse mapping was not retained")
        (args.artifacts / "adb-reverse.txt").write_text(reversed_ports)
        return controller.run()
    except Exception as error:
        (args.artifacts / "precondition-error.json").write_text(json.dumps({
            "sourceSha": SOURCE_SHA, "nativeExecutionAttempted": True,
            "error": str(error), "passed": False,
        }, indent=2) + "\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
