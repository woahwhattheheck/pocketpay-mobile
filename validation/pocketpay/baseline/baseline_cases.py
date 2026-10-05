"""Controlled Android UI evidence; no source hooks/router/persistence are replaced here."""
from baseline_observer_framing import decode_observer_line

BASELINE_SHA = "52ce8006a2d091a4c9f29852a1a530750ff9b3cc"
if os.environ["SOURCE_SHA"] != BASELINE_SHA:
    raise RuntimeError("This proposal is pinned to the reviewed baseline52 source")
REPORT.update({
    "scope": "Actual production components with dummy memory store/read transport",
    "source_sha": BASELINE_SHA,
    "live_signing_or_broadcast": False,
    "secret_ui_retained": False,
    "native_execution_at_preparation": False,
})


def native_records(prefix="POCKETPAY_BASELINE_NATIVE_FIXTURE"):
    logs = adb("logcat", "-d", "-s", "ReactNativeJS:I", timeout=30)
    records = []
    for line in logs.splitlines():
        if prefix not in line:
            continue
        record = decode_observer_line(line, prefix)
        if record is not None:
            records.append(record)
    if not records:
        raise RuntimeError("No actual native fixture records observed")
    return records


def baseline_snapshot(name):
    records = native_records()
    state = records[-1]
    if state.get("ready") is not True:
        raise RuntimeError("Native fixture is not ready")
    # Guard events emit through the vault prefix independently of the baseline
    # observer. Inspect those actual events too; a cached banner can be stale.
    transport_records = native_records("POCKETPAY_VAULT_NATIVE_FIXTURE")
    for record in transport_records:
        for key in ("secretAccess", "broadcastAttempts", "deposit", "withdraw"):
            if key not in record or record[key] != 0:
                raise RuntimeError("Missing/nonzero actual transport counter: " + key)
    state["latestNativeTransportCounters"] = transport_records[-1]
    for record in records:
        transport = record.get("transport", {})
        for key in ("secretAccess", "broadcastAttempts", "deposit", "withdraw"):
            if key not in transport:
                raise RuntimeError("Missing actual native safety counter: " + key)
            if transport[key] != 0:
                raise RuntimeError("Unexpected blocked native action: " + key)
        counts = record.get("counters", {})
        for key in ("walletSaveAttempts", "backupAttempts", "clipboardAttempts"):
            if key not in counts:
                raise RuntimeError("Missing actual native write counter: " + key)
            if counts[key] != 0:
                raise RuntimeError("Unexpected fixture write attempt: " + key)
    (ROOT / (name + "-native-counters.json")).write_text(json.dumps(state, indent=2))
    return state


def launch_case(selected, query=""):
    # Clear only this disposable guest's logging buffer; force-stop resets all
    # memory counters and fixture adapters between independent cases.
    adb("logcat", "-c")
    launch("send/__baseline-native-fixture?case=" + selected + query)


def input_text(value):
    tree = dump()
    fields = [node for node in tree.iter("node")
              if node.attrib.get("class", "").endswith("EditText")
              and node.attrib.get("enabled") == "true"]
    if len(fields) != 1:
        raise RuntimeError("Expected one actual visible native input")
    tap_node(fields[0])
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    # Values are short known dummy input. Password XML may hide its length;
    # bounded native Delete events clear it without clipboard/select-all APIs.
    adb("shell", "input", "keyevent", *(["KEYCODE_DEL"] * 64))
    if value:
        adb("shell", "input", "text", value)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")


def tap_exact_lowest(label):
    tree = dump()
    # Only this known modal label may duplicate its title and lower action.
    node = find_action(tree, label, lowest=(label == "Confirm Lock"))
    if node is None:
        raise RuntimeError("No observed enabled native action: " + label)
    tap_node(node)


def scroll_to(label):
    for _ in range(6):
        tree = dump()
        if contains(tree, label):
            return tree
        adb("shell", "input", "swipe", "360", "1080", "360", "330", "350")
    raise RuntimeError("No actual visible state after scrolling: " + label)


def history_transition():
    launch_case("history")
    wait("No wallet available", seconds=300)
    capture("baseline-history-missing")
    first = baseline_snapshot("history-missing")
    tap("Hydrate DUMMY wallet")
    wait("Received XLM")
    capture("baseline-history-hydrated")
    second = baseline_snapshot("history-hydrated")
    tap("Remove DUMMY wallet")
    wait("No wallet available")
    capture("baseline-history-missing-again")
    third = baseline_snapshot("history-missing-again")
    mounts = [state["counters"]["historyMounts"] for state in (first, second, third)]
    unmounts = [state["counters"]["historyUnmounts"] for state in (first, second, third)]
    if mounts != [1, 1, 1] or unmounts != [0, 0, 0]:
        raise RuntimeError("History host remounted; no same-instance native claim")
    hydrations = [state["counters"]["historyHydrations"] for state in (first, second, third)]
    removals = [state["counters"]["historyRemovals"] for state in (first, second, third)]
    if hydrations != [0, 1, 1] or removals != [1, 1, 2]:
        raise RuntimeError("Native History transition counters are missing or stale")
    if first["walletPresent"] or not second["walletPresent"] or third["walletPresent"]:
        raise RuntimeError("Controlled native hydration states did not match")


def create_masked():
    launch_case("create")
    wait("Generate Keypair", seconds=70)
    capture("baseline-create-initial")
    tap("Generate Keypair")
    scroll_to("Masked secret key")
    wait("Masked secret key", seconds=50)
    tree = capture("baseline-create-generated-masked")
    if contains(tree, "Revealed secret key"):
        raise RuntimeError("Secret reveal was observed; no readiness claim")
    state = baseline_snapshot("create-masked")
    if state["counters"]["generateKeypair"] != 1:
        raise RuntimeError("Expected exactly one controlled dummy generation")
    # Never touch Reveal, Copy or Continue.


def import_invalid():
    launch_case("import")
    wait("56-character key", seconds=70)
    capture("baseline-import-initial")
    tap_exact_lowest("Import Wallet")
    wait("Please enter your secret key")
    capture("baseline-import-empty-error")
    input_text("DUMMY_INVALID_SECRET")
    tap_exact_lowest("Import Wallet")
    wait("secret keys start with")
    capture("baseline-import-prefix-error")
    input_text("SINVALID")
    tap_exact_lowest("Import Wallet")
    wait("secret key is too short")
    capture("baseline-import-length-error")
    baseline_snapshot("import-invalid")


SIGN_QUERY = (
    "&source=GBTL47RTFR5EKMZSXWOQU735WBK7LRPPDIDK3JTNTCZZ7NUBBRDTVSK2"
    "&destination=GAFVCOWZWSJEAFOKBEBO2B4QITJ2YXN6YIYG6BUURQINVDVW4OPS3OL6"
    "&amount=10&assetCode=XLM&memo=Native%20dummy%20review&fee=100&network=Testnet"
)


def assert_review_events(expected):
    events = [record for record in native_records() if record.get("event") == "signReviewRouteEntries"]
    if len(events) != expected:
        raise RuntimeError("Missing real native navigation events")
    for record in events:
        if (record.get("routeName") != "review-transaction"
                or record.get("destination") != "GAFVCOWZWSJEAFOKBEBO2B4QITJ2YXN6YIYG6BUURQINVDVW4OPS3OL6"
                or record.get("amount") != "10" or record.get("memo") != "Native dummy review"):
            raise RuntimeError("Actual Review destination/amount/memo differ from the dummy review")


def sign_navigation():
    launch_case("sign", SIGN_QUERY)
    wait("Confirm Signing", seconds=70)
    capture("baseline-sign-summary")
    tap_exact_lowest("Cancel")
    wait("Cancel Signing")
    capture("baseline-sign-cancel-dialog")
    tap_exact_lowest("Keep Reviewing")
    wait("Confirm Signing")
    before = baseline_snapshot("sign-kept-reviewing")
    if before["counters"]["signReviewRouteEntries"] != 0:
        raise RuntimeError("Cancel confirmation unexpectedly navigated")
    tap("Sign Transaction", scroll=True)
    wait("Review Transaction")
    capture("baseline-sign-real-review-route")
    entered = baseline_snapshot("sign-first-review")
    if entered["counters"]["signReviewRouteEntries"] != 1:
        raise RuntimeError("Expected one observed real Review route entry")
    assert_review_events(1)
    # Never press the production Review screen's Sign & Send.
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    wait("Confirm Signing")
    capture("baseline-sign-navigation-return")
    wait_enabled_action("Sign Transaction")
    tap("Sign Transaction", scroll=True)
    wait("Review Transaction")
    capture("baseline-sign-second-real-review-route")
    again = baseline_snapshot("sign-second-review")
    if again["counters"]["signReviewRouteEntries"] != 2:
        raise RuntimeError("Navigation return did not produce one new real Review entry")
    assert_review_events(2)
    REPORT["optional_observations"].append({
        "name": "sign-return-availability",
        "result": "actual navigation only; Slot may remount, so no same-instance focus or repeated-tap claim",
    })


def sign_invalid():
    launch_case("sign")
    wait("Invalid Transaction", seconds=70)
    capture("baseline-sign-missing-params")
    baseline_snapshot("sign-invalid")


def picker_search_optional_edit():
    launch_case("picker")
    wait("Select Contact", seconds=70)
    capture("baseline-picker-with-edit")
    input_text("DUMMY")
    wait("DUMMY Alice")
    capture("baseline-picker-name-search")
    input_text("UNMATCHED_FIXTURE_TERM")
    wait("No contacts found")
    capture("baseline-picker-no-match")
    input_text("")
    wait("DUMMY Alice")
    tap("DUMMY Alice")
    wait("Select callback:")
    capture("baseline-picker-selection-callback")
    selected = baseline_snapshot("picker-selected")
    if selected["counters"]["pickerSelect"] != 1:
        raise RuntimeError("Expected one production picker selection callback")
    events = [record for record in native_records() if record.get("event") == "pickerSelect"]
    if len(events) != 1 or events[0].get("address") != "GAFVCOWZWSJEAFOKBEBO2B4QITJ2YXN6YIYG6BUURQINVDVW4OPS3OL6":
        raise RuntimeError("Actual selected dummy address did not match")
    tap("Open picker without edit callback")
    wait("Select Contact")
    capture("baseline-picker-without-edit")
    # Compare actual PNG/XML icon presence during independent human review;
    # existing unlabeled edit/delete icons are not tapped by guessed coordinates.
    tap("+ Add New Contact")
    wait("Add callback.")
    capture("baseline-picker-add-callback")
    state = baseline_snapshot("picker-add")
    if [state["counters"][key] for key in ("pickerSelect", "pickerAddNew", "pickerEdit", "pickerCancel")] != [1, 1, 0, 0]:
        raise RuntimeError("Unexpected picker callback sequence")


def diagnostics_ready():
    # This pinned Diagnostics screen exposes only nonsecret native probes and
    # truncated public keys. Record only this case, never Create/Import/Share.
    # An original guest video may establish a fleeting loading frame; no delay
    # is injected into the production hook and no loading claim is made here.
    remote = "/sdcard/pocketpay-diagnostics-loading.mp4"
    recorder = subprocess.Popen(["adb", "shell", "screenrecord", "--size", "720x1280",
                                 "--bit-rate", "800000", "--time-limit", "10", remote],
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        launch_case("diagnostics")
        wait("App Information", seconds=70)
        capture("baseline-diagnostics-ready")
        scroll_to("Secure Storage")
        capture("baseline-diagnostics-native-storage-status")
        baseline_snapshot("diagnostics-ready")
    finally:
        try:
            _, error = recorder.communicate(timeout=15)
            (ROOT / "diagnostics-screenrecord-status.json").write_text(json.dumps({
                "exit": recorder.returncode, "stderr": error.decode("utf-8", "replace"),
                "loading_observed": "Independent original-frame review required",
            }, indent=2))
            if recorder.returncode == 0:
                adb("pull", remote, str(ROOT / "baseline-diagnostics-original.mp4"))
        except subprocess.TimeoutExpired:
            recorder.terminate()
            recorder.communicate(timeout=10)
            (ROOT / "diagnostics-screenrecord-timeout.txt").write_text("Recorder did not finish; no loading claim")
        finally:
            adb("shell", "rm", "-f", remote, check=False)


def diagnostic_share_cancel():
    launch_case("share")
    wait("Something went wrong", seconds=70)
    capture("baseline-real-error-fallback")
    tap("Share redacted diagnostics log", "Share Diagnostics", scroll=True)
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        resumed = adb("shell", "dumpsys", "activity", "activities")
        if any(re.search(r"(?:mResumedActivity|topResumedActivity).*?(?:Chooser|Resolver)Activity", line)
               for line in resumed.splitlines()):
            (ROOT / "native-share-activity.txt").write_text(resumed)
            break
        time.sleep(0.4)
    else:
        raise RuntimeError("Actual Android chooser activity was not observed")
    try:
        capture("baseline-real-native-share-sheet")
        state = baseline_snapshot("share-sheet")
        counts = state["counters"]
        if any(counts[key] != 1 for key in ("shareCalls", "shareStringPayload", "shareRedactedPayload")):
            raise RuntimeError("Native share did not receive one resolved redacted string")
    finally:
        # Cancel even if capture/assertion failed. Never choose a recipient,
        # app or Copy action, and never leave a chooser for later test cases.
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
    wait("Something went wrong")
    capture("baseline-share-cancel-return")
    baseline_snapshot("share-return")


def vault_real_confirmation():
    adb("logcat", "-c")
    launch("__vault-native-fixture")
    wait("Set Aside for 30 Days", seconds=70)
    capture("baseline-vault-dummy-ready")
    input_text("10")
    tap("Set Aside for 30 Days", scroll=True)
    wait("Confirm Lock")
    capture("baseline-vault-confirm-lock")
    tap_exact_lowest("Confirm Lock")
    wait("Transaction Receipt", seconds=60)
    tree = capture("baseline-vault-success-receipt")
    for expected in ("lock", "10 XLM", "Success", "mock-lock"):
        if not contains(tree, expected):
            raise RuntimeError("Missing actual receipt value: " + expected)
    tap_exact_lowest("Done")
    wait("addLock=1")
    capture("baseline-vault-dispatch-counters")
    records = native_records("POCKETPAY_VAULT_NATIVE_FIXTURE")
    for state in records:
        if any(state[key] != 0 for key in ("deposit", "withdraw", "secretAccess", "broadcastAttempts")):
            raise RuntimeError("Unexpected blocked vault action")
    state = records[-1]
    if state["addLock"] != 1 or state["persistedLocks"] != 1 or state["lastLock"]["amount"] != "10":
        raise RuntimeError("Expected one actual production memory-backed lock")
    (ROOT / "vault-dispatch-native-counters.json").write_text(json.dumps(state, indent=2))


for name, callback in (
    ("history-same-instance-transition", history_transition),
    ("create-dummy-masked", create_masked),
    ("import-empty-invalid", import_invalid),
    ("sign-real-navigation-return", sign_navigation),
    ("sign-missing-params", sign_invalid),
    ("picker-search-optional-edit", picker_search_optional_edit),
    ("diagnostics-real-readiness", diagnostics_ready),
    ("diagnostics-native-share-cancel", diagnostic_share_cancel),
    ("vault-native-confirmation-receipt", vault_real_confirmation),
):
    case(name, callback)

REPORT["native_execution_at_preparation"] = "Results above must come from the guest; proposal syntax checks are not execution"
(ROOT / "observations.json").write_text(json.dumps(REPORT, indent=2))
print(json.dumps(REPORT, indent=2))
sys.exit(0 if all(item["result"] == "passed" for item in REPORT["cases"]) else 1)
