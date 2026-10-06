"""Pure strict framing decoder. No ADB, UI, source, filesystem or network operations."""
import json
import re

PRIMARY_PREFIX = "POCKETPAY_RETRY_PRIMARY_NATIVE_OBSERVER"
GAP_PREFIX = "POCKETPAY_RETRY_GAP_NATIVE_OBSERVER"
PREFIXES = (PRIMARY_PREFIX, GAP_PREFIX)
_LOGCAT = re.compile(
    r"\d{2}-\d{2}[ \t]+\d{2}:\d{2}:\d{2}\.\d{3}[ \t]+\d+[ \t]+\d+[ \t]+I[ \t]+ReactNativeJS:[ \t]+(?P<body>[^\r\n]*)"
)
_METRO = re.compile(r"[ \t]*INFO[ \t]+(?P<body>[^\r\n]*)")


def _reject_constant(_):
    raise ValueError("Non-finite value is not JSON")


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def decode_observer_line(line, prefix):
    """Return an object only for one exact supported prefix/framed JSON record.

    Accepts bare ``PREFIX {JSON}``, RN's actual ``'PREFIX', '{JSON}'``
    framing, and those bodies within the retained native I/ReactNativeJS or
    Metro INFO envelopes. Full matching forbids substring salvage or trailing
    material. This function does not validate counter/source/outcome semantics;
    every existing caller validation must remain unchanged after decoding.
    """
    if prefix not in PREFIXES or not isinstance(line, str):
        return None
    body = line.strip(" \t\r\n")
    if "\r" in body or "\n" in body:
        return None
    transport = _LOGCAT.fullmatch(body) or _METRO.fullmatch(body)
    if transport:
        body = transport.group("body").strip(" \t")
    marker = re.escape(prefix)
    frame = re.fullmatch(
        rf"(?:{marker}[ \t]+(?P<plain>\{{.*\}})|'{marker}',[ \t]*'(?P<quoted>\{{.*\}})')", body
    )
    if frame is None:
        return None
    payload = frame.group("plain") or frame.group("quoted")
    try:
        record = json.loads(payload, parse_constant=_reject_constant, object_pairs_hook=_unique_object)
    except (ValueError, TypeError, RecursionError):
        return None
    return record if isinstance(record, dict) else None
