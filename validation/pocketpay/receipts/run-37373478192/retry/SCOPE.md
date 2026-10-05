# Manual PocketPay Android evidence controller

This dedicated controller branch contains manual validation only. It is excluded
from product, prerequisite and feature PRs. The workflow has no push trigger,
schedule, deployment, payment operation, owner secret or write token; its Actions
permissions are `contents: read`. Source checkouts use immutable commit pins and
retain their original product tree independently of temporary fixtures.

| Mode | Published product source | Original product tree |
| --- | --- | --- |
| Baseline and Vault | `52ce8006a2d091a4c9f29852a1a530750ff9b3cc` | `b7556026e93c5930915d12fdf51d421773c5f61e` |
| Camera #297 | `e92351b71869f6be89229511c9898e20d50369c9` | `a9bf24a0884e3fc200f4be66c1e4b1919d53dada` |
| Retry #321 | `ddd56649099d1fc5763ef29af3bfba0363897bd6` | `4e363d77915ca16d3490e677f78c6487aeeb7060` |

Each isolated Ubuntu 24.04 job has a 30-minute bound, real KVM acceleration,
Android API 34 Google APIs x86_64 and a 720×1280 viewport. The emulator uses
`-camera-back none -camera-front none`; genuine CameraView mounting errors, not
camera mocks, must produce unavailable-state evidence. Actions are pinned to
reviewed source SHAs. Official Expo Go 54.0.8 APK SHA-256 is
`d72ed2cec15bf029c942d1cb70c933976ec83048e00d130bbfa6bad8cf22331a`.

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

Original Scan-launch and Contacts Scan-tap guest clips support independent
transient-frame review. The immutable permission/UI collector remains unchanged.
Permission loading is optional evidence: native XML and a matching actual frame
must be observed. No SDK delay, camera/permission mock or fabricated frame is
used. Unobserved transient state or unexercised loading fallback remains unproved.

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
actual SDK-version/Connected-to-expo-cli sheet is captured and closed by Back
before app targets can be accepted. No generic Continue/consent action is used.
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

Artifacts are retained for 14 days by the bounded manual workflow. Source,
controller, runtime and fixture pins must be checked alongside actual media
before adding evidence to a product PR. Preparation checks are recorded as
preparation only; they are never native execution or full CI claims.
