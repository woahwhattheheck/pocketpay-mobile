# Baseline quoted-vault peer receipt: retained text only

Actual input is run `37379451997` baseline `logcat.txt`, SHA-256
`6fce0dbdb0fff7eb670099d878e995a2ca1d320078a991da32e2718ff5a2fe31`.
It contains one vault observer line at794 and zero
`POCKETPAY_BASELINE_NATIVE_FIXTURE` lines. The fixture records the exact whole
native line, line hash without newline, original whole JSON text/hash and all
15 public object fields.

The actual line is a quoted `POCKETPAY_VAULT_NATIVE_FIXTURE` record with
`event=bootstrap-ready`. Both immutable old `native_records` functions
(fragment `baseline_cases.py` and composed `ui_baseline.py`) are identical.
Executed purely with their ADB transport returning retained text, both reject
the quoted actual frame with `No actual native fixture records observed`.
The original decoder leaves `', '` before the JSON after its `lstrip(" :")`.

Ledger's already-composed `baseline_observer_framing.py`, SHA-256
`788d2fb8861b52ee6bb84101b05b7ff34cd2707918dfabe17fce3bb91e74c443`,
strictly decodes that exact whole native line to an object equal in every key
and value to the original JSON. Its source is captured as immutable metadata
for this read-only proof. No competing helper or integration patch was created.
The proof also checks the bare equivalent and eight synthetic rejection cases.
An explicit source-derived substitution of the baseline token is labeled
synthetic framing coverage and never counted as native baseline evidence.

Actual vault initializer counters are `addLock=0`, `deposit=0`, `withdraw=0`,
`secretAccess=0`, `broadcastAttempts=0`, `blockedFetch=0`, `blockedXHR=0`,
`balanceReads=0`, `lockReads=0`, `reachabilityReads=0`, `passphraseReads=0`,
`persistedLocks=0`, with `lastLock=null`. This is initializer evidence only.
It does not prove Confirm Lock, a lock/withdraw dispatch, success receipt,
History hydration, diagnostics, create/import, sign navigation or any native
baseline-flow pass. The actual payload has no source SHA/tree attestation.

`python3 -B reproduce-proof.py` reproduces the pure differential from frozen
old-function/helper metadata and the hash-checked original retained log. It
writes only this receipt's `parser-proof-receipt.json`. One Python file passes
syntax parsing; all pure differential checks pass. No controller, product,
original artifact, image/video, ref, workflow or device was changed/executed.
`provenance.json` freezes the exact proof, fixture and input hashes for the
parent's composed review. Ledger owns all integration.
