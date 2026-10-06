# Manual PocketPay Android evidence controller

This dedicated controller branch contains manual validation only. It is excluded
from product, prerequisite and feature PRs. The workflow has no push trigger,
schedule, deployment, payment operation, owner secret or write token; its Actions
permissions are `contents: read`. Source checkouts use immutable commit pins and
retain their original product tree independently of temporary fixtures.

| Mode | Published product source | Original product tree |
| --- | --- | --- |
| Baseline and Vault | `52ce8006a2d091a4c9f29852a1a530750ff9b3cc` | `b7556026e93c5930915d12fdf51d421773c5f61e` |
| Camera #297 | `314b69b9a4ac4c4328540792fcc516e6ce5c6e16` | `d024fbbd8393b855508da14a0b2fba9441c7a5f4` |
| Retry #321 | `ddd56649099d1fc5763ef29af3bfba0363897bd6` | `4e363d77915ca16d3490e677f78c6487aeeb7060` |

Each isolated Ubuntu 24.04 job has a 30-minute bound and requires real KVM acceleration,
Android API 34 Google APIs x86_64 and a 720×1280 viewport. The emulator uses
`-camera-back none -camera-front none`; genuine CameraView mounting errors, not
camera mocks, must produce unavailable-state evidence. Actions are pinned to
reviewed source SHAs. Official Expo Go 54.0.8 APK SHA-256 is
`d72ed2cec15bf029c942d1cb70c933976ec83048e00d130bbfa6bad8cf22331a`.

The three matrix jobs run one at a time (`max-parallel: 1`), retaining independent
failure results. Serialization limits simultaneous hosted runner requests; it
does not guarantee runner availability. The KVM preflight keeps the original
udev rule and mandatory readable/writable `/dev/kvm` gate. Each provisioning
command now has separate stdout, stderr and exit status plus a 15-second TERM
bound and a further five-second KILL bound. The trigger waits only for its own
udev events (`--settle`). Before/after/exit device diagnostics are retained even
on failure; missing optional metadata cannot satisfy the mandatory access gate.

`controller-manifest.json` locks all controller files. Prepared fixtures also
retain their separate immutable manifests and production-file hash checks.
Preparation refuses mismatched source SHA/tree, dirty tracked source, changed
fixture bytes or existing fixture destinations. The only tracked changes in
retry/baseline subject checkouts are temporary `package.json.main` selections.
Production screens, hooks, stores and service implementations remain unchanged.

## Camera

The validation route renders the unchanged actual Scan/Contacts screens through
`app/send/__camera-native-fixture.tsx`, using RootLayout's existing `send`
exemption for missing-wallet routes. Permission hook, CameraView, app stores and
transport are not replaced. Real Android permission requests/denials and scoped
permission flags control the disposable guest only. Required native state,
manual fallback and editable input must be visible in actual PNG/XML evidence.
A separate first-denial Contacts suite begins only after an observed successful
`pm clear host.exp.exponent` on the dedicated guest, because Expo remembers its
asked-permission cache. No owner device, owner data, wallet or saved contact is
involved. The guest is discarded after the run.

The separate frozen `send/` packet measures the actual Send form without a launch
fixture, wallet initialization or permission mock. Immediately after the original
Contacts unavailable/manual case, while its real OS grant is still current, it
enters one fixed checksum-valid public dummy recipient into the observed focused
recipient field. It leaves amount/memo empty, opens the actual embedded scanner,
requires its real unavailable branch and returns through the manual action.
Before/after native EditText XML must hold the same complete 56-character value;
PNG frames provide visible form context. It performs no Review, Sign, Save,
broadcast or clipboard action. Production startup hooks may perform normal reads.

The Send prerequisite receipt references the actual prior native grant dialog
XML/PNG and current granted-permission record with their exact hashes, plus the
observed disposable guest reset. Send independently rechecks source custody,
runtime, effective viewport, current CAMERA grant and actual zero camera devices.
Its result is separate from the original Contacts case. An ordinary failed
observation can continue only through the next case's existing force-stop/reset;
an unsafe environment/media/custody result blocks remaining user-fixed and
Contacts-first-denial cases without further guest actions.
The integration wrapper also preserves an original camera secret/media or known
render-error condition as unsafe exit 2 even though the immutable collector
catches case exceptions. It stops the owned recorder without pulling/retaining
an active video. Unsafe cleanup collects only local exit/source metadata and
stops owned Metro; it performs no final guest log, UI or screenshot collection.

Original Scan-launch and Contacts Scan-tap guest clips support independent
transient-frame review. The immutable permission/UI collector remains unchanged.
The collector's loading capture is optional because slow XML dumps can miss a
transient frame. Final readiness still requires direct original-frame evidence
of the changed loading state and its manual action. Original launch/Scan-tap
clips must be reviewed alongside actual PNG/XML; deterministic denial and
unavailable passes cannot waive that state. No SDK delay, camera/permission mock
or fabricated frame is used. An unobserved transient state or unexercised loading
fallback remains unproved and is a specific readiness hold.

## Retry

The original byte-identical native321 bootstrap supplies a fixed dummy Testnet
wallet/session, dummy Account/preflight responses, a 1,600 ms submission timeout
and a 1,600 ms status read. The production Review screen builds, signs and hashes
that dummy transaction; the controlled submit method cannot broadcast. The
primary observer calls each original dummy method exactly once, awaits and
rethrows without changing result/error identity, and logs only public hash,
phase, counters and unknown-submission object identity. It blocks HTTP/XHR/RPC
writes and wallet saves. The production recovery screen must offer only
read/status/navigation actions, preserve unresolved identity and clear only a
definitively resolved payment when Done is pressed.

The cold-start launch waits for the real root navigation key and actual native
navigation ref readiness, subscribes to native lifecycle events and navigates
once. Each case force-stops the process to reset memory adapters/observers.
The three additional no-hash/empty/mismatched-hash cases install separate guards
before rendering the original byte-identical gap fixture. Those cases block
secret access and signing, require zero submissions and retain uncertainty.

Primary Review/Recovery clips are original eight-second Android screenrecord
files. They cover only reviewed public-only dummy screens and preserve the
original transport timing. Loading/pending frames need direct independent
original-frame review; timers, counter events and elapsed time are insufficient
for a visible-state claim. Primary Activity may perform real read-only
reachability/root probes. The gap fixture supplies its documented controlled
HEAD response and blocks other external fetch/XHR requests.

## Baseline and Vault

The frozen `baseline/` packet describes exact nine safe native cases and limits.
Its fixtures use dummy memory stores and block wallet persistence, clipboard,
secret access, deposit, withdrawal and broadcasts. Create stops with its secret
masked; Import uses only empty/invalid dummy strings. Sign observes summary,
cancel and actual Review navigation and stops before Sign & Send. History's
missing→hydrated→missing transition must preserve the same host instance.
Diagnostics performs the actual native SecureStore nonsecret sentinel probe.
Share must receive a resolved redacted string and show the actual native chooser,
which is cancelled before selecting a recipient/app/Copy target. Vault requires
one actual Confirm Lock press, the production mock-lock receipt and actual
`addLock=1`, `deposit=0`, `withdraw=0`, `secretAccess=0`,
`broadcastAttempts=0`, `memoryLocks=1` counters.

These observations do not prove live custody, randomness, successful import,
durable contacts/wallet storage, real service balances, live cryptographic
payments, ledger delivery or all app flows. Dummy state/transport are labeled in
media and reports. The native Diagnostics capability probe is specifically
identified; it is not wallet secret storage coverage.

## Evidence and prior failures

Only actual ADB PNGs, UI hierarchies, original videos, timestamped native logs and
counter records support a native assertion. Selectors require observed exact
enabled clickable actions with visible bounds and no disabled ancestor. Expo's
actual SDK-version/Connected-to-expo-cli sheet is captured and closed only by the source-bound native header Close, with same-activity host-only before/after proof
before app targets can be accepted. Only the observed SDK54/runtime/instructional developer-menu tutorial permits its unique native Button Continue; all generic Continue/consent actions remain excluded.
XML guards reject secret-shaped/revealed-secret UI before retaining media.
Failure remains failure; cleanup captures/logs never change an exit status.

Run `37368574667` reached actual Android 14/API34, installed the pinned Go APK and
bundled the app, but **all three camera and all four retry assertions failed**.
Camera was redirected to Welcome; retry's old validation route navigated before
the Root Layout was ready. No native camera/retry pass or production defect is
established by that run. Original failure PNG/XML and provenance are retained in
`receipts/run-37368574667/` and its cumulative JSON receipt. Earlier SDK-path and
optional GUI version-probe failures are retained separately. This successor
corrects validation route/readiness behavior without product edits.

Run `37373478192` verified the reviewed controller, retry product source,
fixtures and official APK hash, then failed the unchanged KVM preflight before
Android boot. The old quiet command block did not identify the failing command,
so no hardware absence, permission failure or settlement race is inferred.
Camera and baseline jobs acquired no hosted runner; both check-run annotations
state that the job was not acquired even after multiple attempts. They executed
no steps and produced no native capture. Exact retry preparation files, preflight
log and hosted-runner annotations are retained in `receipts/run-37373478192/`.
This preparation failure is not a product failure or native execution.

Artifacts are retained for 14 days by the bounded manual workflow. Source,
controller, runtime and fixture pins must be checked alongside actual media
before adding evidence to a product PR. Preparation checks are recorded as
preparation only; they are never native execution or full CI claims.


## Successor of run37379451997

Run37379451997 used exact controller51d8/b937 and source52/314/ddd. All three
jobs booted with KVM and retained original artifacts, but all native acceptance
gates failed. Camera and Retry were obstructed by the actual Expo SDK54 first-run
developer-menu introduction; no camera permission/fallback/Send or Retry signing/
recovery pass was observed. Camera's original19.982-second startup clip ended
before the first27.568-second Metro bundle, so it provides no product loading
frame. Baseline failed before all9 targets with the actual runtime-not-ready
dummy-generator initializer error. These are validation failures; no product
defect or feature readiness is inferred.

The exact three provider ZIP archives, their SHA256s, current-run receipt and
independent media reviews are retained under receipts/run-37379451997. Prior
run37368574667 failure media and run37373478192 preparation/runner failures
remain unchanged. Current logcat and historical Metro observations retain
separate attribution; zero initialization counters are never successful flows.

The historical e69 controller added recognition of the actual observed SDK54/runtime/tutorial
Bottom Sheet in the host package and its unique enabled native Button Continue.
Before/action/after media must prove host tutorial closure, with productStatePassed
false; ordinary product waits and safety/counter gates still must pass. Recognized
closure/transport errors fail explicitly. No warm deep-link replay, auth bypass,
product change or permission timing alteration is added. Actual Scan startup
recordings are60 seconds within the original bounded suite, and loading/manual
readiness still requires visible original product frames.

Two exact-prefix Retry framing callsites now decode the original quoted native
transport. A separate baseline/vault literal whitelist uses the same strict
envelopes; the one observed Vault seed record decodes but cannot satisfy the
unchanged one-lock/zero-write gates. The baseline prefix examples are source-
derived parser cases, not observed native records.

Baseline's reviewed preload seam binds the actual installed Metro module/factory
ABI before stores/router initialization, preserving unselected getter descriptors
and replacing only the dummy generator and vault write-guard slots. Owner and
independent local fatal-guard/dummy-generator/write-blocker checks pass; both
failed full local bundle preparation logs remain retained. No native, Hermes or
full-bundle success is claimed. The active job installs7 baseline files and
checks4 JavaScript syntax inputs, then mirrors the vault route and identical
blockers. The standalone vault entry/setup is inactive historical scaffolding
and is not repaired or validated.

The exact actual runtime-not-ready host redbox blocks hidden target/actions and
app-success captures; failure-only captures retain the original error. A fatal
initializer failure records the current failure and marks later cases blocked/
unattempted, avoiding repeated target timeouts. The historical e69 controller had no baseline tutorial
adaptation or baseline warm replay; the new scoped host/first-History proposal is described below.


The terminal execution of controller e69c9150bda234607c008955ba2e5e5c853b8ae1 in run37387043100 failed all three mode jobs. Its immutable provider ZIPs, actual selected media, source/controller readbacks, failure logs and independent camera/Retry receipts are retained under receipts/run-37387043100. Camera and Retry did not complete their feature flows: Expo host chrome covered required targets, or the guest was on Launcher. Original camera/Retry MP4s are absent and that absence is preserved. The collector reported no producer completion proof; the collection repair alone proves no old or future loading frame.

Baseline had three narrowly observed native cases: missing-transaction guidance; Diagnostics loading to actual ready/native storage; and a real Android redacted text share chooser cancelled without recipient choice. Original Diagnostics video frame49 (PTS6.013056) shows Loading diagnostics, frame50 (PTS6.393744) shows ready. Six other baseline cases failed or remained incomplete, so the prerequisite is still unaccepted. Sign summary was host-covered, picker selection was ambiguous across Recent/Saved rows, and Vault confirmation was not observed. All product source pins and the manual workflow remain unchanged.

This successor's prospective host adapters bind raw callbacks, close only reviewed exact Expo controls, retain host-only before/after proof, and require fresh uncovered product hierarchy. Late host coverage excludes product PNGs. Retry preserves actual signing/recovery identity, counters and record history without any URI delivery; baseline preserves strict actual safety/history and original semantic case validators without initialization or seeding; only the separately reviewed first-History conditional original URI delivery is permitted. The baseline collector has one fixed global600-second bound: expired remaining callbacks are unattempted, and no case extends its deadline. The first baseline cold launch previously had Welcome beneath host chrome; menu closure does not prove the intended route was delivered. That target remains an actual runtime gate.

The source-confirmed camera original-URI proposal must retain its own once-only same native activity/task/HOT proof and original safety/media requirements; it cannot qualify a product state by itself. Actual visible permission-loading/manual frames remain mandatory for camera readiness, and counter/timer records do not substitute for original media. Every future mode result still requires independent original-media review before external feature publication.

### Final host and bounded launch proposal

Run37387043100 remains a failed native run with three narrow baseline observations passed and six cases failed. Actual Back backgrounded Expo instead of closing its ordinary menu. This successor uses exact source-bound SDK54 native header Close, with actual host-only closure media and unchanged process/activity proof. No product state follows from host closure alone. Camera can deliver its original permitted URI once only at initial uncovered Welcome; Retry has no URI delivery. The separately reviewed first independent History case can deliver its exact captured original URI once only before any product target, media, or action, after same foreground ExperienceActivity/task/PID, full host closure and fresh PID-scoped current whole baseline/vault zero-counter records are established. That carrier accepts only HOT in the same activity/task/PID and strict source-derived child-refresh→missing→mounted append prefixes with one canned HEAD/root read below30seconds. Historical Metro zero rows are test evidence only, never runtime credentials for this gate. All original History transition/counter/media gates remain mandatory. No fixture reset, delay, source edit or extra live transport is introduced.

Baseline and Retry each retain one original global600-second collector clock. Installed raw ADB timeouts are capped to remaining budget; before/after raw dumps, final targets/actions/captures and remaining callbacks reject expiry. Baseline observer reads explicitly use logcat --pid=currentGoPID, with unique PID rechecked and separate numbered guarded raw output/query receipts. No mobile feature publication or full baseline acceptance is implied by these unexecuted controller repairs.

### Host-proof custody

Every host closure has its own exclusive proof directory so later observations cannot overwrite earlier XML/PNG/activity/preservation proof. Camera uses a host-only proxy and keeps owner output/recorder/unsafe metadata at the original product root. Baseline temporarily scopes only host proof output, restores it on every exit, preserves shared helper's original local-stem closure JSON and separately binds latest root-relative stems for the unchanged first-History carrier. Retry uses separate primary/gap and closure namespaces. Product captures, report names, source/outcome/counter semantics and shared helper bytes remain fixed. Pre-existing proof directories fail before helper work; no reused directory is permission to continue. Test-only mock output bytes remain temporary; retained historical native media are bound to original provider ZIPs and provenance.
