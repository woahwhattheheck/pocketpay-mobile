"""Unexecuted candidate: importing/preparing this file performs no native operation."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shlex
import struct
import subprocess
import time

from ui_guard import (PACKAGE, PERMISSION_PACKAGES, PUBLIC_RECIPIENT, SCAN_ACTION, MANUAL_ACTION, UNAVAILABLE,
                      UnsafeEnvironment, UnsafeMedia, bounds, contains, destination_field, developer_sheet,
                      effective_viewport, enabled_chain, exact_action, guard_xml, ime_visible, parents, product_guard, reject_error)
from verify_checkout import SOURCE_SHA, SOURCE_TREE, verify


class Controller:
    def __init__(self, serial, output, checkout, receipt):
        self.serial = serial
        self.output = output
        self.deadline = time.monotonic() + 300
        self.developer_dismissals = 0
        self.report = {"sourceSha": SOURCE_SHA, "sourceTree": SOURCE_TREE,
                       "nativeExecution": True, "passed": False,
                       "cameraMocked": False, "permissionHookMocked": False,
                       "walletInitializedByController": False, "sendFixtureInstalled": False,
                       "reviewSignSaveOrBroadcastActionInvoked": False,
                       "controlledProductActions": [], "observedKeyboardDismissals": [], "observations": []}
        self.checkout = checkout
        try:
            self.report["sourceProvenance"] = verify(checkout, runtime=True)
        except Exception as error:
            raise UnsafeEnvironment("Pinned source custody is invalid") from error
        receipt_text = receipt.read_text()
        if re.search(r"\bS[A-Z2-7]{55}\b", receipt_text):
            raise UnsafeMedia("Owner receipt contains secret-shaped text")
        data = json.loads(receipt_text)
        required = {"exclusiveDisposableEmulator": True, "freshGuestContainsNoUserWallet": True,
                    "actualOsCameraGrantObserved": True, "frontAndBackCameraHardwareAbsent": True,
                    "stellarNetwork": "TESTNET", "sourceSha": SOURCE_SHA, "serial": serial}
        if any(data.get(key) != value for key, value in required.items()):
            raise UnsafeEnvironment("Owner's isolated guest/actual OS-grant prerequisite receipt is incomplete")
        grant_artifacts = data.get("actualOsGrantEvidence", [])
        if not grant_artifacts:
            raise UnsafeEnvironment("Actual prior OS-grant receipt must reference retained evidence hashes")
        checked = []
        grant_dialog_xml = False
        grant_dialog_png = False
        for item in grant_artifacts:
            path = Path(item["path"]).resolve()
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != item["sha256"]:
                raise UnsafeEnvironment("Actual OS-grant prerequisite evidence changed")
            # XML, when supplied, is read through the same no-secret guard.
            if path.suffix == ".xml":
                tree = guard_xml(path.read_text())
                parent_map = parents(tree)
                if any(node.get("package") in PERMISSION_PACKAGES
                       and node.get("resource-id", "").endswith(":id/permission_allow_foreground_only_button")
                       and node.get("clickable") == "true" and enabled_chain(node, parent_map)
                       and bounds(node) for node in tree.iter("node")):
                    grant_dialog_xml = True
            if path.suffix == ".png" and path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
                grant_dialog_png = True
            checked.append({"path": str(path), "sha256": digest})
        if not grant_dialog_xml or not grant_dialog_png:
            raise UnsafeEnvironment("Prior actual OS grant requires retained native foreground-allow dialog XML and PNG")
        self.report["ownerPrerequisiteReceipt"] = {
            "path": str(receipt), "sha256": hashlib.sha256(receipt.read_bytes()).hexdigest(),
            "facts": {key: data[key] for key in required}, "verifiedArtifactHashes": checked,
            "limit": "Prior actual OS grant and clean no-wallet guest are owner-supplied prerequisites; current native CAMERA flags are measured below."}

    def adb(self, *args, binary=False):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("Send candidate exceeded its 300-second bound")
        result = subprocess.run(["adb", "-s", self.serial, *args], check=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=min(12, remaining))
        return result.stdout if binary else result.stdout.decode("utf-8", "replace")

    def dump(self):
        remote = "/sdcard/pocketpay-send-preservation-ui.xml"
        try:
            self.adb("shell", "uiautomator", "dump", "--compressed", remote)
            xml = self.adb("exec-out", "cat", remote)
        finally:
            self.adb("shell", "rm", "-f", remote)
        return guard_xml(xml), xml

    def permission_flags(self, name):
        raw = self.adb("shell", "dumpsys", "package", PACKAGE)
        lines = [line.strip() for line in raw.splitlines() if "android.permission.CAMERA:" in line and "granted=" in line]
        if not lines or any("granted=true" not in line for line in lines):
            raise UnsafeEnvironment("Actual prior OS grant is no longer granted; no permission mutation is performed")
        (self.output / (name + ".txt")).write_text("\n".join(lines) + "\n")
        self.report["observations"].append({"name": name, "actualNativeCameraFlags": lines})

    def prerequisites(self):
        if self.adb("get-state").strip() != "device":
            raise UnsafeEnvironment("Required isolated guest is not an ADB device")
        if self.adb("shell", "getprop", "ro.kernel.qemu").strip() != "1":
            raise UnsafeEnvironment("Candidate rejects physical devices")
        if self.adb("shell", "getprop", "ro.build.version.sdk").strip() != "34":
            raise UnsafeEnvironment("Candidate requires the reviewed API34 guest")
        size = self.adb("shell", "wm", "size")
        viewport = effective_viewport(size)
        raw = self.adb("shell", "dumpsys", "package", PACKAGE)
        version = [line.strip() for line in raw.splitlines() if "versionName=" in line]
        if not any(re.search(r"\bversionName=54\.0\.8\b", line) for line in version):
            raise UnsafeEnvironment("Candidate requires the reviewed Expo Go54.0.8 runtime")
        reverse = self.adb("reverse", "--list")
        if not any("tcp:8081 tcp:8081" in line for line in reverse.splitlines()):
            raise UnsafeEnvironment("Warm canonical Metro port8081 reverse mapping is absent")
        camera = self.adb("shell", "dumpsys", "media.camera")
        counts = re.findall(r"Number of camera devices:\s*(\d+)\b", camera)
        if not counts or any(value != "0" for value in counts):
            raise UnsafeEnvironment("Actual camera-service device count does not prove the required zero-camera guest")
        self.report["nativePrerequisites"] = {"api": 34, "emulator": True, "viewport": viewport,
                                               "expoGoVersion": version, "reverse": reverse.strip(),
                                               "actualCameraServiceDeviceCounts": counts}
        self.permission_flags("camera-granted-before-send")

    def capture(self, name, validator, sheet=False):
        before, xml = self.dump()
        if sheet:
            reject_error(before)
            if not developer_sheet(before):
                raise RuntimeError("Actual recorded developer sheet is absent")
        else:
            product_guard(before)
            self.require_hidden_ime()
        validator(before)
        png = self.adb("exec-out", "screencap", "-p", binary=True)
        if (not png.startswith(b"\x89PNG\r\n\x1a\n") or len(png) < 24 or png[12:16] != b"IHDR"
                or struct.unpack(">II", png[16:24]) != (720, 1280)):
            raise UnsafeEnvironment("Native screenshot PNG/actual viewport is invalid")
        after, after_xml = self.dump()
        if sheet:
            reject_error(after)
            if not developer_sheet(after):
                raise RuntimeError("Developer sheet changed during capture; no media retained")
        else:
            product_guard(after)
            self.require_hidden_ime()
        validator(after)
        for suffix, data in ((".xml", xml.encode()), ("-after.xml", after_xml.encode()), (".png", png)):
            (self.output / (name + suffix)).write_bytes(data)
        self.report["observations"].append({"name": name, "beforeAndAfterXmlGuarded": True,
                                           "nativePng": True})

    def wait(self, validator, seconds=45):
        until = min(self.deadline, time.monotonic() + seconds)
        while time.monotonic() < until:
            tree, _ = self.dump()
            reject_error(tree)
            # Covered UI is handled before any acceptance of background Send.
            if developer_sheet(tree):
                if self.developer_dismissals >= 2:
                    raise UnsafeEnvironment("Bounded observed developer-sheet dismissals exceeded")
                self.capture("observed-expo-sheet-" + str(self.developer_dismissals + 1), lambda _: None, sheet=True)
                current, _ = self.dump()
                reject_error(current)
                if not developer_sheet(current):
                    raise UnsafeEnvironment("Developer sheet disappeared before its scoped BACK")
                self.adb("shell", "input", "keyevent", "KEYCODE_BACK")
                self.developer_dismissals += 1
                continue
            product_guard(tree)
            try:
                validator(tree)
                return tree
            except UnsafeEnvironment:
                raise
            except RuntimeError:
                time.sleep(0.2)
        raise RuntimeError("Actual required Send/scanner state not observed within bound")

    def tap_action(self, label):
        tree, _ = self.dump()
        if label == SCAN_ACTION:
            destination_field(tree, PUBLIC_RECIPIENT)
        elif label == MANUAL_ACTION:
            self.unavailable(tree)
        else:
            raise UnsafeEnvironment("Controller action is outside its two scanner actions")
        node = exact_action(tree, label)
        self.require_hidden_ime()
        x1, y1, x2, y2 = bounds(node)
        self.adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
        self.report["controlledProductActions"].append(label)

    def require_hidden_ime(self):
        if ime_visible(self.adb("shell", "dumpsys", "input_method")):
            raise UnsafeEnvironment("Actual native IME covers product action/capture")

    def recipient_with_modal_closed(self, tree):
        field, _ = destination_field(tree, PUBLIC_RECIPIENT, require_complete_form=False)
        if (contains(tree, UNAVAILABLE) or contains(tree, "Checking camera permission")
                or contains(tree, "QR code scanner camera") or contains(tree, MANUAL_ACTION)):
            raise RuntimeError("Actual scanner modal still covers Send")
        exact_action(tree, SCAN_ACTION)
        return field

    def dismiss_recipient_keyboard(self, phase):
        if ime_visible(self.adb("shell", "dumpsys", "input_method")):
            current, _ = self.dump()
            field = self.recipient_with_modal_closed(current)
            if field.get("focused") != "true" or not ime_visible(self.adb("shell", "dumpsys", "input_method")):
                raise UnsafeEnvironment("Actual recipient focus/visible IME changed before its scoped dismissal")
            self.adb("shell", "input", "keyevent", "KEYCODE_BACK")
            self.report["observedKeyboardDismissals"].append(phase)
        self.require_hidden_ime()

    def enter_recipient(self):
        tree, _ = self.dump()
        node, association = destination_field(tree, "", initial=True)
        x1, y1, x2, y2 = bounds(node)
        self.adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
        focused, _ = self.dump()
        field, _ = destination_field(focused, "", initial=True, require_complete_form=False)
        if field.get("focused") != "true" or any(other.get("focused") == "true" for other in focused.iter("node")
                                                   if other.get("class") == "android.widget.EditText" and other is not field):
            raise RuntimeError("Exact recipient field does not hold native focus; no input sent")
        self.adb("shell", "input", "text", PUBLIC_RECIPIENT)
        self.wait(lambda tree: destination_field(tree, PUBLIC_RECIPIENT, require_complete_form=False), seconds=12)
        self.dismiss_recipient_keyboard("after-fixed-public-recipient-entry")
        self.report["recipientEntry"] = {"fixedPublicDummyAddress": PUBLIC_RECIPIENT,
                                         "nativeFocusedRecipientBeforeInput": True,
                                         "initialAssociation": association,
                                         "keyboardBackOnlyIfActuallyVisible": True}

    def unavailable(self, tree):
        product_guard(tree)
        if not contains(tree, UNAVAILABLE) or not contains(tree, "We couldn't start the camera"):
            raise RuntimeError("Actual production QrScanner camera-mount error is absent")
        exact_action(tree, MANUAL_ACTION)

    def run(self):
        self.report["stage"] = "native-prerequisites"
        self.prerequisites()
        self.adb("shell", "am", "force-stop", PACKAGE)
        launch = self.adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
                          "-d", shlex.quote("exp://127.0.0.1:8081/--/send"), "-p", PACKAGE)
        (self.output / "actual-send-launch.txt").write_text(launch)
        self.report["stage"] = "actual-send-empty-form"
        self.wait(lambda tree: destination_field(tree, "", initial=True))
        self.capture("send-empty-production-form", lambda tree: destination_field(tree, "", initial=True))
        self.report["stage"] = "recipient-native-focus-and-entry"
        self.enter_recipient()
        before_tree = self.wait(lambda tree: destination_field(tree, PUBLIC_RECIPIENT))
        before, association = destination_field(before_tree, PUBLIC_RECIPIENT)
        field_bounds = bounds(before)
        def unchanged_recipient(tree):
            field, _ = destination_field(tree, PUBLIC_RECIPIENT)
            if bounds(field) != field_bounds:
                raise RuntimeError("Recipient field geometry changed; exact before/after association is not proven")
            if contains(tree, UNAVAILABLE):
                raise RuntimeError("Scanner overlay still covers Send")
            exact_action(tree, SCAN_ACTION)
        self.report["stage"] = "recipient-before-scanner"
        self.capture("send-recipient-before-embedded-scanner", unchanged_recipient)
        self.tap_action(SCAN_ACTION)
        self.report["stage"] = "actual-embedded-camera-unavailable"
        self.wait(self.unavailable)
        self.permission_flags("camera-granted-at-actual-unavailable")
        self.capture("actual-send-embedded-camera-unavailable", self.unavailable)
        self.tap_action(MANUAL_ACTION)
        self.report["stage"] = "recipient-after-manual-fallback"
        self.wait(self.recipient_with_modal_closed)
        # Native Modal dismissal can restore input focus/IME. Only the exact
        # public recipient in actual Send with no scanner may authorize BACK.
        self.dismiss_recipient_keyboard("after-observed-closed-scanner-fallback")
        self.wait(unchanged_recipient)
        self.capture("send-recipient-after-manual-fallback", unchanged_recipient)
        self.permission_flags("camera-granted-after-manual-fallback")
        try:
            self.report["sourceProvenanceAfterMeasurement"] = verify(self.checkout, runtime=True)
        except Exception as error:
            raise UnsafeEnvironment("Pinned source custody changed during measurement") from error
        self.report["recipientPreservation"] = {
            "beforeNativeEditTextValue": PUBLIC_RECIPIENT, "afterNativeEditTextValue": PUBLIC_RECIPIENT,
            "exactEqual": True, "nativeBoundsBeforeAndAfter": list(field_bounds), "association": association,
            "amountAndMemoRemainEmpty": True, "actualUnavailableFallbackTapped": True,
            "sameLaunchNoNavigationOrRestartBetweenBeforeAndAfter": True,
            "sameReactInstanceLimit": "No component instrumentation: unchanged production source uses Modal and onClose, and measured flow has no route transition/restart."}
        self.report.update({"passed": True, "status": "passed", "stage": "complete",
                            "exitCode": 0, "safeToAttemptNextIndependentCase": True})


def main():
    parser = argparse.ArgumentParser(description="Unexecuted candidate for later coordinated Send preservation measurement")
    parser.add_argument("--serial", required=True)
    parser.add_argument("--source-checkout", type=Path, required=True)
    parser.add_argument("--owner-prerequisite-receipt", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    args = parser.parse_args()
    if args.artifacts.exists():
        raise SystemExit("Refusing to overwrite existing native evidence")
    args.artifacts.mkdir(parents=True)
    controller = None
    try:
        controller = Controller(args.serial, args.artifacts, args.source_checkout, args.owner_prerequisite_receipt.resolve())
        controller.run()
    except (UnsafeEnvironment, subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError):
        # Do not include raw XML/error strings or take a failure screenshot.
        report = controller.report if controller else {"nativeExecution": False}
        report.update({"passed": False, "status": "blocked_unsafe_environment", "exitCode": 2,
                       "safeToAttemptNextIndependentCase": False,
                       "failure": "Unsafe secret/overlay/media/device/custody/receipt condition; further actions and media capture stopped"})
        (args.artifacts / "observations.json").write_text(json.dumps(report, indent=2) + "\n")
        return 2
    except Exception as error:
        report = controller.report if controller else {"nativeExecution": False}
        report.update({"passed": False, "status": "failed_observation", "exitCode": 1,
                       "safeToAttemptNextIndependentCase": True, "failureType": type(error).__name__,
                       "failure": "Native precondition/observation failed; no unguarded failure media or further product actions"})
        (args.artifacts / "observations.json").write_text(json.dumps(report, indent=2) + "\n")
        return 1
    (args.artifacts / "observations.json").write_text(json.dumps(controller.report, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
