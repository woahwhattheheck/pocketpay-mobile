Local Retry late-host adapter proposal
====================================

This is a controller-only derivative of `e69c9150bda234607c008955ba2e5e5c853b8ae1`.
It changes no PocketPay screen, store, signing service, fixture route, observer,
transport, payment timing, source branch, published controller or run. Product
source stays `ddd56649099d1fc5763ef29af3bfba0363897bd6`, tree
`4e363d77915ca16d3490e677f78c6487aeeb7060`.

The original run 37387043100 had four failed primary cases and three failed
gap cases. Review/guidance XML showed the actual tutorial covering targets;
one failure showed the Android launcher. Its 69 files and immutable peer
receipt remain untouched. Those observations establish neither a successful
host closure nor a production payment-recovery flow.

Integration files are `retry_host_adapter.py`, the two derivative primary/gap
collectors, and the byte-exact shared `expo_ordinary_menu.py` helper. Unchanged
framing/intro/overlay helpers in this packet support local reproducibility;
the existing runtime `expo_go_module_intro.py` and camera selector dependencies
remain in the combined controller. Tests and copied original fixtures are
review inputs, not app fixtures or evidence of a new native execution.

The adapter binds raw dump/ADB callbacks before installation. Shared host
capture uses raw callbacks and cannot call settling recursively. Only the
actual strict tutorial or observed ordinary header context can be acted upon;
incomplete/ambiguous sheets fail. All observed host Bottom Sheets, including
partial sheets, block product PNG acceptance before and after screencap.
The original post-capture rejection remains active: settling never hides an
overlay that appeared while the PNG was in memory.

Primary wait, capture, screenshot, recording and enabled-action/tap paths now
settle before their next fresh target observation. Gap wait/capture/tap paths
do likewise. After closure, the pending target must be freshly observed,
and the original exact enabled clickable action still owns the single tap.
An ignored `None` capture cannot qualify a mandatory gap target. Optional
explicit-label captures retain their return convention.

Host closure never redelivers a URI, reloads, force-stops, clears logs, signs,
submits, or looks up a transaction. The original independent-case launcher
alone still performs its existing process restart. Review, no-hash, mismatch
and empty states can all be reset by re-mounting the original route, even with
zero operation counters, so Retry has no URI replay path.

Before/after host handling requires the same existing PID, strict source and
case records, exact prior record history, and unchanged identity/hash/phase,
lookup and counters for every appended record. Reinitialization events or
signer-store notifications are rejected even when final public fields match:
an active Review reset can otherwise be invisible. Stable state without
records fails; genuine initial absence requires a successful strict log read,
and any first initialization must have zero operation counters. An ambiguous
in-flight completion during closure fails rather than synthesizing progress.
The normal primary signing counter rules and gap zero-signing rules remain
in their unchanged original validators.

Pure checks use actual retained XML and decoded observer rows with an explicitly
mocked ADB boundary. Mock PNG bytes exist only inside temporary directories;
they are never native evidence. The differential proves old actual primary
capture rejects a late intro, new capture closes only host controls and gets a
fresh target, while a newly appearing/partial post-PNG sheet still excludes
the product image. Negatives cover ambiguity, intermediate/restored identity,
same-public-field reset, counters, missing history, PID replacement and parser
failure. Original `primary_snapshot`, payment outcome logic (apart from the
controller-only first `begin_case`) and gap decoder ASTs stay exact. The frozen
gap outcome collector and all fixture/transport/observer bytes are untouched.

Run owner pure checks locally with:

    python -B -m unittest discover -s pocketpay-retry-late-host-local-candidate -p test_retry_host_adapter.py -v

No device/ADB action occurs in that suite. Actual Android captures/actions and
independent original-frame review remain required before any native gate or
external feature PR can be marked ready.
