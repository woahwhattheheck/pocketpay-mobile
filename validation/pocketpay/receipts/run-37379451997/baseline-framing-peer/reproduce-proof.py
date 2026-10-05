"""Retained-text framing proof only; no proposed helper, controller import or ADB operation."""
import ast
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
VAULT = "POCKETPAY_VAULT_NATIVE_FIXTURE"
BASELINE = "POCKETPAY_BASELINE_NATIVE_FIXTURE"


def old_records(source, text, prefix):
    namespace = {"json": json, "adb": lambda *args, **kwargs: text}
    # Only frozen old native_records is compiled. Its ADB transport is retained text.
    exec(compile(ast.parse(source), "immutable-old-baseline-native-records", "exec"), namespace)
    try:
        return {"accepted": True, "records": namespace["native_records"](prefix)}
    except RuntimeError as error:
        return {"accepted": False, "exceptionType": type(error).__name__, "message": str(error)}


def main():
    inputs = json.loads((HERE / "immutable-inputs.json").read_text())
    fixture = json.loads((HERE / "actual-vault-framing-fixture.json").read_text())
    log_path = Path(inputs["inputs"]["logcat"]["path"])
    assert hashlib.sha256(log_path.read_bytes()).hexdigest() == inputs["inputs"]["logcat"]["sha256"]
    actual_logs = log_path.read_text(errors="replace")
    helper = {}
    # This is ledger's immutable existing pure helper, copied as source metadata
    # in JSON for the peer receipt, never patched or installed in a controller.
    exec(compile(ast.parse(inputs["inputs"]["ledgerHelper"]["source"]), "immutable-ledger-helper", "exec"), helper)
    decode = helper["decode_observer_line"]
    original = {name: old_records(meta["functionSource"], actual_logs, VAULT)
                for name, meta in inputs["oldDecoderSources"].items()}
    assert all(not result["accepted"] for result in original.values())
    actual = decode(fixture["actualLine"], VAULT)
    expected = fixture["wholePublicObject"]
    assert actual == expected and len(actual) == len(expected)
    bare = VAULT + " " + fixture["wholePayloadJsonText"]
    assert decode(bare, VAULT) == expected
    negatives = {
        "wrong-prefix": fixture["actualLine"].replace(VAULT, BASELINE),
        "wrong-tag": fixture["actualLine"].replace("ReactNativeJS:", "OtherJS:"),
        "embedded-prefix": "unrelated " + bare,
        "trailing-material": fixture["actualLine"] + " extra",
        "extra-json": VAULT + " " + fixture["wholePayloadJsonText"] + " {}",
        "missing-closing-quote": fixture["actualLine"][:-1],
        "nonobject-array": VAULT + " []",
        "nonobject-null": VAULT + " null",
    }
    assert all(decode(line, VAULT) is None for line in negatives.values())
    # Source-derived token substitution is synthetic framing coverage ONLY.
    synthetic_baseline = fixture["actualLine"].replace(VAULT, BASELINE)
    assert decode(synthetic_baseline, BASELINE) == expected
    synthetic_old = old_records(inputs["oldDecoderSources"]["ui_baseline.py"]["functionSource"], synthetic_baseline, BASELINE)
    assert synthetic_old["accepted"] is False
    actual_baseline_lines = [line for line in actual_logs.splitlines() if BASELINE in line]
    assert actual_baseline_lines == []
    receipt = {
        "nativeExecution": False, "controllerOrProductWrites": False, "deviceOrDispatchOperations": False,
        "actualArtifactRun": "37379451997", "actualInputSha256": inputs["inputs"]["logcat"]["sha256"],
        "actualFixtureLine": fixture["lineNumber"], "actualVaultPrefixLines": 1, "actualBaselinePrefixLines": 0,
        "originalExactFunctions": original,
        "ledgerStrictHelper": {"path": inputs["inputs"]["ledgerHelper"]["path"],
                               "sha256": inputs["inputs"]["ledgerHelper"]["sha256"],
                               "wholeObjectPreserved": actual == expected, "objectKeyCount": len(actual)},
        "actualWholePublicObject": actual,
        "actualEvidenceLimit": "One actual vault bootstrap-ready initializer, addLock/persistedLocks=0. No native vault action/receipt or baseline flow success established. Payload has no source SHA/tree attestation.",
        "syntheticOnlyChecks": {"negativeFramingCases": list(negatives), "allRejected": True,
                                "baselineTokenSubstitution": {"kind": "synthetic-source-derived-framing-only",
                                                              "actualNativeEvidence": False,
                                                              "strictWholeObjectPreserved": True,
                                                              "oldFunctionResult": synthetic_old}},
        "allPureDifferentialChecksPassed": True,
        "negativeFramingCasesRejected": 8,
    }
    (HERE / "parser-proof-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"oldExactFunctionsRejected": True, "ledgerStrictWholeObjectEqual": True,
                      "actualVaultLines": 1, "actualBaselineLines": 0, "event": actual["event"],
                      "addLock": actual["addLock"], "persistedLocks": actual["persistedLocks"],
                      "nativeFlowPassClaim": False}))


if __name__ == "__main__":
    main()
