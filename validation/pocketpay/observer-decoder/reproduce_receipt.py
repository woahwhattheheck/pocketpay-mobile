"""Pure retained-log/parser reproduction; never imports controllers or executes ADB."""
import ast
import collections
import hashlib
import json
from pathlib import Path

from observer_framing import GAP_PREFIX, PRIMARY_PREFIX, PREFIXES, decode_observer_line

HERE = Path(__file__).resolve().parent
CONTROLLER = Path("/workspace/scratch/ea8baa184658/pocketpay-remote-native-controller-kvm-next")
ARTIFACTS = Path("/workspace/scratch/ea8baa184658/pocketpay-remote-native-evidence/37379451997/retry")
SOURCE_SHA = "ddd56649099d1fc5763ef29af3bfba0363897bd6"
PARSERS = {
    "native_records": CONTROLLER / "validation/pocketpay/retry/observation_helpers.py",
    "primary_snapshot": CONTROLLER / "validation/pocketpay/retry-primary-ui.py",
}
IMMUTABLE = json.loads((HERE / "immutable-callers.json").read_text())


def original_fragment(line, prefix):
    if prefix not in line:
        return None
    try:
        return json.JSONDecoder().raw_decode(line.split(prefix, 1)[1].lstrip(" :"))[0]
    except ValueError:
        return None


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def exact_original_function(name, retained_logcat):
    source = IMMUTABLE["functions"][name]["source"]
    definition = ast.parse(source).body[0]
    namespace = {"json": json, "ROOT": HERE, "adb": lambda *args: retained_logcat}
    # Only the exact parser function is compiled. The sole transport callable
    # returns already-retained text; no controller module or subprocess exists.
    exec(compile(ast.Module(body=[definition], type_ignores=[]), str(PARSERS[name]), "exec"), namespace)
    try:
        if name == "native_records":
            records = namespace[name]()
        else:
            records = namespace[name]("reproduction-only", "unknown", 1, 0)
        return {"rejected": False, "result": records}
    except RuntimeError as error:
        return {"rejected": True, "exceptionType": type(error).__name__, "message": str(error),
                "exactFunctionExecutedWithRetainedTextOnly": True}


def main():
    receipt = {
        "nativeExecution": False, "controllerOrSourceWrites": False, "dispatchWrites": False,
        "run": "37379451997", "expectedPayloadSourceSha": SOURCE_SHA,
        "originalParserSources": IMMUTABLE["sources"],
        "immutableCallerExtractionSha256": sha(HERE / "immutable-callers.json"),
        "inputs": {}, "framingCounts": [], "publicGroups": [], "indexedPublicRecords": [],
        "limits": ["Pure parsing of original retained logs only; no native-flow pass",
                   "Metro records are historical console transport, not current logcat records",
                   "Current logcat was cleared between cases and retains only latest primary-unknown/gap-mismatch observer events",
                   "Observer sourceSha is payload provenance; payload does not independently attest a source tree",
                   "Zero submission/read counters and initialization/store-state records do not prove a completed native submission or lookup"]}
    groups = collections.defaultdict(list)
    fixtures = []
    for filename in ("logcat.txt", "metro.log"):
        path = ARTIFACTS / filename
        text = path.read_text(errors="replace")
        receipt["inputs"][filename] = {"path": str(path), "sha256": sha(path), "bytes": path.stat().st_size}
        for prefix in PREFIXES:
            candidates = [(i, line) for i, line in enumerate(text.splitlines(), 1) if prefix in line]
            original = [(i, original_fragment(line, prefix)) for i, line in candidates]
            decoded = [(i, decode_observer_line(line, prefix)) for i, line in candidates]
            original_ok = [(i, record) for i, record in original if record is not None]
            strict_ok = [(i, record) for i, record in decoded if record is not None]
            if len(strict_ok) != len(candidates):
                raise RuntimeError("Strict decoder did not decode every actual expected framing")
            if original_ok and any(record != decode_observer_line(dict(candidates)[i], prefix) for i, record in original_ok):
                raise RuntimeError("Plain-frame decoded semantics differ from the original")
            receipt["framingCounts"].append({"input": filename, "prefix": prefix, "actualPrefixLines": len(candidates),
                                             "originalFragmentAccepted": len(original_ok), "strictAnchoredAccepted": len(strict_ok),
                                             "rejectedLineNumbersByOriginal": [i for i, record in original if record is None]})
            if candidates:
                i, line = candidates[0]
                fixtures.append({"input": filename, "lineNumber": i, "prefix": prefix,
                                 "originalAccepted": original_fragment(line, prefix) is not None,
                                 "actualLine": line, "expected": decode_observer_line(line, prefix)})
            for i, record in strict_ok:
                if record.get("sourceSha") != SOURCE_SHA:
                    raise RuntimeError("Actual decoded observer source mismatch")
                indexed = {"input": filename, "lineNumber": i, "prefix": prefix, "record": record}
                receipt["indexedPublicRecords"].append(indexed)
                groups[(filename, prefix, record.get("outcome"))].append(indexed)
    for (filename, prefix, outcome), records in groups.items():
        keys = sorted({key for item in records for key in item["record"].get("counters", {})})
        ranges = {key: {"minimum": min(item["record"]["counters"][key] for item in records),
                        "maximum": max(item["record"]["counters"][key] for item in records)} for key in keys}
        latest = records[-1]
        receipt["publicGroups"].append({"input": filename, "prefix": prefix, "outcome": outcome,
                                        "recordCount": len(records), "lineNumbers": [item["lineNumber"] for item in records],
                                        "sourceShaAllMatch": True, "counterRanges": ranges,
                                        "latestPublicState": latest})
    retained_logcat = (ARTIFACTS / "logcat.txt").read_text(errors="replace")
    receipt["exactOriginalFunctionReproductions"] = {name: exact_original_function(name, retained_logcat) for name in PARSERS}
    if not all(value.get("rejected") for value in receipt["exactOriginalFunctionReproductions"].values()):
        raise RuntimeError("Expected exact original retained-logcat rejection was not reproduced")
    receipt["allDecodedPublicRecordsSourceShaMatch"] = True
    (HERE / "actual-framing-fixtures.json").write_text(json.dumps(fixtures, indent=2) + "\n")
    (HERE / "parser-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"framingCounts": receipt["framingCounts"], "groups": [
        {"input": group["input"], "prefix": group["prefix"], "outcome": group["outcome"], "count": group["recordCount"],
         "finalPhase": group["latestPublicState"]["record"].get("phase"),
         "unknownPresent": group["latestPublicState"]["record"].get("unknownPresent"),
         "counters": group["latestPublicState"]["record"].get("counters"),
         "lastLookup": group["latestPublicState"]["record"].get("lastLookup")} for group in receipt["publicGroups"]]}, indent=2))


if __name__ == "__main__":
    main()
