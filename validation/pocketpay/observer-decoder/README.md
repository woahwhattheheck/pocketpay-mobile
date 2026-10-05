# Native observer framing candidate: prepared locally, not integrated

This isolated candidate reproduces a parser defect using original retained
retry artifacts from run `37379451997`. It contains one pure framing helper,
positive/negative/differential fixtures, immutable source-derived caller
functions, and an indexed public-state receipt. No active controller, product
source, ref, workflow, guest, image or video was edited or executed here.

The existing decoder uses
`raw_decode(line.split(prefix, 1)[1].lstrip(" :"))[0]`. Actual native logcat
frames are `'PREFIX', '{JSON}'`; the remaining fragment starts with `', '`,
so both original functions reject every retained native observer record.
Metro's `INFO PREFIX {JSON}` frames are unquoted and parse successfully.

| Retained transport/prefix | Actual records | Original accepts | Strict helper accepts |
| --- | ---: | ---: | ---: |
| logcat / primary | 4 | 0 | 4 |
| logcat / gap | 4 | 0 | 4 |
| Metro / primary | 23 | 23 | 23 |
| Metro / gap | 11 | 11 | 11 |

The helper recognizes only the two exact supported observer tokens, an entire
bare `PREFIX {JSON}` or quoted `'PREFIX', '{JSON}'` body, optionally inside
the observed timestamp/pid/tid `I ReactNativeJS:` envelope or `INFO` Metro
envelope. It consumes exactly one JSON object and all closing framing. It
rejects unrelated embedded markers, wrong tokens/tags/levels, malformed quotes
or commas, extra/trailing JSON/text, arrays/null/scalars, duplicate keys and
non-finite values. There is no quote trimming, arbitrary substring salvage,
JSON sanitization, ADB, UI or network operation in the helper.

## Later reviewed integration

Only the owner may integrate this into a new controller version. Import
`decode_observer_line` and replace each original decoder try-block with:

```python
record = decode_observer_line(line, prefix)
if record is None:
    continue
```

In `native_records`, append that `record` to the existing records list. In
`primary_snapshot`, continue into the existing source/counter/outcome logic.
Keep all other caller checks, writing/redaction, return behavior and exceptions
unchanged. The helper supplies framing only; it does not validate, modify or
hide source SHA, outcome, counters, unknown identity or transaction state.

`immutable-callers.json` captures exact `native_records`, `snapshot`, and
`primary_snapshot` function source, original source paths/hashes and line
numbers. The pure differential harness compiles only those functions, mocks
only their ADB text transport to already-retained text, and substitutes only
the two original decoder try-blocks. It does not import or operate a controller.
It proves original native-logcat rejection, repaired actual gap-state equality,
and continued rejection of wrong source/outcome, nonzero/missing safety
counters, unexpected unknown clearing, and inconsistent submission counts.
The actual primary initialization record passes its existing `(0, 0)` contract
and still fails a claimed `(1, 0)` submission contract. No test fabricates a
native submission or lookup success.

## Public records and limits

Every decoded record's payload source SHA is
`ddd56649099d1fc5763ef29af3bfba0363897bd6`. Payloads do not independently
attest a tree. The receipt records original input hashes, file/line/prefix,
all public records, per-outcome counter ranges and latest public state.

| Observer/outcome | Current logcat records | Historical Metro records | Latest recorded state |
| --- | ---: | ---: | --- |
| Primary / unknown | 4 | 17 | unknown present; zero submissions and reads; no lookup |
| Primary / error | 0 | 3 | review; unknown absent; zero submissions and reads |
| Primary / confirmed | 0 | 3 | review; unknown absent; zero submissions and reads |
| Primary / failed | 0 | 0 | not recorded |
| Gap / nohash | 0 | 4 | unknown present; zero reads; no lookup |
| Gap / empty | 0 | 3 | idle; unknown absent; zero reads; no lookup |
| Gap / mismatch | 4 | 4 | unknown present; zero reads/mismatch responses; no lookup |

All recorded secret/signing/submission/read/broadcast/RPC-write/wallet-save
safety or operation counters are zero. Store-update counters are nonzero as
recorded. Current logcat was cleared between cases and retains the latest
primary-unknown/gap-mismatch observer initialization/store-state events only;
the earlier nohash/empty records are Metro history. Primary unknown records
also span later gap fixture initialization, so grouping by observer outcome
alone is not evidence of a completed primary submission case.

These facts establish the framing defect and the recorded initialization/state
counters. They do not establish native UI taps, submission, delayed status
lookup, mismatch handling, details/help/activity navigation or any native-flow
pass. Original images/video are owned and reviewed independently by the parent.
This candidate does not alter original test assertions or mark a flow ready.

## Local reproduction

```sh
python3 -B -m unittest -v test_observer_framing.py test_caller_validations.py
python3 -B reproduce_receipt.py
```

All16 tests pass; four Python files pass syntax parsing. Reproduction writes
only candidate `actual-framing-fixtures.json` and `parser-receipt.json`, using
original retained log inputs and frozen caller extraction. It operates no
device and changes no controller. `provenance.json` freezes every candidate
file plus original input and caller-source hashes for parent/ledger review.
Any integration requires its own new immutable controller manifest and gates.
