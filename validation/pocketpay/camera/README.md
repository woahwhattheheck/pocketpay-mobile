# Camera follow-up: prepared locally, not executed

This controller is pinned to camera commit
`e92351b71869f6be89229511c9898e20d50369c9`, tree
`a9bf24a0884e3fc200f4be66c1e4b1919d53dada`. Production ScanScreen,
ContactsScreen, QrScanner, Expo's permission hook and CameraView stay unchanged.
The existing launch wrapper is copied into `fixtures/` with only its explanatory
comment changed for the send path; its production imports and rendering remain
unchanged. Its SHA-256 is
`2a2e23c5a8c0e36c1b58b80e2931c183c7998d609bf7d134a44baf351189beb0`.
No source branch, ref, workflow, dispatch, publication or device was changed
during this preparation.

## Coordinated execution prerequisites

The owner must supply an exclusive, disposable Android API34 guest with Expo
Go54.0.8 with front/back emulator camera hardware absent, and a warm Metro
server on port8081 serving the exact canonical camera
checkout. Install only the reviewed wrapper at
`app/send/__camera-native-fixture.tsx` in that disposable validation checkout;
its relative imports render the actual production screens. The separate setup
script installs only that reviewed untracked wrapper into a supplied clean
disposable clone. The UI controller does not install it, install packages,
start Metro or boot/reset a device. Do not carry the old auth wrapper into the
clone: the send path uses the existing missing-wallet RootLayout exemption.

Use fresh Expo Go app data for the denied-case sequence, with no user wallet or
contacts. Finish observed Expo onboarding before the controller starts without
opening/requesting camera access. Expo caches requested permissions in
`expo.modules.permissions.asked`; clearing native user-set/user-fixed flags
alone does not reset that SDK cache. The controller deliberately does not clear
app data. If initial Scan has no Request action, it stops as a failed fresh-data
precondition and does not manufacture denial evidence.

The controller's later execution performs scoped native CAMERA revoke/flag
changes for this disposable Expo Go package and grants through the actual OS
dialog for the original camera-unavailable cases. It leaves CAMERA denied and
user-fixed; discard/reset the disposable guest afterward. It never mocks
camera access, inserts a QR code, enters a key/address/contact, saves a
wallet/contact, signs or sends a payment, or selects a share/clipboard target.
This one packet repeats the three original primary camera cases and adds the
supported user-fixed and optional loading observations.

This single reviewed packet has two distinct collector suites. Both are
required before camera readiness. They use separate fresh disposable Expo Go
data states so one suite's SDK permission-request cache cannot substitute for
the other suite's ordinary first denial. The ledger owner may reset only the
dedicated guest Expo Go data with `adb -s EXCLUSIVE_ADB_SERIAL shell pm clear
host.exp.exponent`, retaining its exact successful `Success` output separately
for each suite. This reset never targets a physical owner's phone or data.
The UI collectors themselves clear only guest CAMERA flags and require that
reset receipt; they never clear app data.

After each guest-only reset, verify the package/SDK and Metro reverse mapping
remain unchanged, finish observed Expo onboarding without requesting camera,
and invoke the corresponding collector:

```sh
python3 camera_followup.py --serial EXCLUSIVE_ADB_SERIAL \
  --source-checkout /absolute/disposable/canonical-camera-checkout \
  --suite primary-and-user-fixed \
  --fresh-data-receipt /absolute/evidence/camera/reset-primary.txt \
  --artifacts /absolute/evidence/camera/primary

python3 camera_followup.py --serial EXCLUSIVE_ADB_SERIAL \
  --source-checkout /absolute/disposable/canonical-camera-checkout \
  --suite contacts-first-denial \
  --fresh-data-receipt /absolute/evidence/camera/reset-contacts-first-denial.txt \
  --artifacts /absolute/evidence/camera/contacts-first-denial
```

The serial is mandatory. Existing evidence is never overwritten. The complete
each collector has a600-second wall-clock bound, with per-command timeouts and
strict source SHA/tree/working-tree/fixture checks. It exits nonzero on any
failed case or native/cache precondition; subsequent dependent cases stop.
Each suite copies its reset receipt, retains actual Expo Go package metadata,
ADB reverse mapping, source provenance and a fresh `observations.json`. A
passing primary suite is not a passing Contacts ordinary-denial measurement.
The primary ordinary first-denial case is ScanScreen only and does not prove
Contacts/QrScanner's ordinary-denial auto-request behavior. That behavior must
be measured by the distinct fresh `contacts-first-denial` suite.

## What later native evidence can establish

| Case | Supported control and required actual observation |
| --- | --- |
| Scan denied, can ask again | Revoke CAMERA and clear native flags; open actual Scan; tap exact Request; retain the real OS dialog; deny through the scoped Android permission-controller resource ID; observe CAMERA granted=false, actual permission-required UI with Request still available; tap manual fallback and retain editable Send XLM. |
| Scan unavailable | From the actual askable denial state, request and grant through the real OS dialog; require native CAMERA granted=true and actual production Camera Unavailable mount-error UI; manual fallback must expose editable Send XLM. |
| Contacts unavailable | Retain granted native CAMERA state; open actual Contacts and its Scan QR action; require actual QrScanner Camera unavailable mount-error UI; manual fallback must expose Add New Contact without saving. |
| Scan user-fixed | After that real request/denial has established Expo's cache, revoke and set actual native user-set/user-fixed flags; relaunch to refresh the real hook; verify dumpsys flags and actual blocked-settings message, no Request action; manual fallback must expose editable Send XLM. |
| Contacts user-fixed | Keep the same real blocked native state; open actual Contacts and its exact Scan QR action; observe actual settings instruction, no Grant action; manual fallback must dismiss the scanner and expose actual Add New Contact with editable inputs. No Save action is pressed. |
| Contacts ordinary first denial, distinct fresh suite | Clear only native CAMERA flags, open actual Contacts through `/send`, open actual QrScanner and deny exactly one observed real OS dialog. Require actual askable denied guidance with Grant Permission and manual form. If a native prompt remains/reappears after that one denial, retain actual PNG/XML and CAMERA flags as a failed observation; perform no additional deny/grant or generic dismissal. A hard-blocked state is also failure, never a substitute for ordinary first-denial guidance. |
| Permission loading, optional | Retain only if actual Checking camera permission… and the manual action appear in before/after XML surrounding a real native PNG. Otherwise report not_observed. No hook delay, synthetic response, spinner fabrication or unsupported branch is added. |

Loading is the Expo hook's initial `null` value, not an OS request dialog.
Requesting permission does not reset the response to `null`. It usually settles
before UI Automator can capture it; that is an honest `not_observed` result and
does not fail the measured denial/user-fixed cases. Even an observed loading
frame does not establish its manual button callback was executed while that
branch was active; `loadingFallbackExercised` remains false.

QrScanner auto-requests when `!granted && canAskAgain`, including a fresh denied
response. This sequence uses generic Scan for the real first denial, then the
Contacts scanner under granted or actual user-fixed states in the primary
suite. The distinct Contacts-first-denial suite intentionally measures that
source re-request risk and stops if another prompt appears. Both hooks need
a relaunch/remount after external permission
changes; neither refreshes from Settings through an AppState listener.

## Evidence and limits

Selectors require exact individual text/content-desc or a scoped native permission
resource ID and one enabled clickable node. They reject disabled ancestor chains
and ambiguous matches. Targets must lie fully within the verified actual
720x1280 guest viewport;
positive offscreen or partially clipped boxes are rejected rather than tapped.
Generic substring actions, guessed screen coordinates, arbitrary consent
dismissal and unguarded failure screenshots are absent. XML is checked for raw secret-shaped content and the
Revealed secret key label before any local media is retained. Capture also
requires a fresh checked after-frame XML; a changed transient state is not
labeled as the requested state. The controller removes only its temporary
remote XML after reading it. An Expo developer sheet is dismissed only with
BACK after both actual SDK Version and Connected to expo-cli labels are
observed and retained and no native permission dialog is present. This check
precedes loading/target acceptance; captures/taps/native-action waits reject
that sheet except its explicit evidence capture. There is no blind Got it,
Wait, Continue, native permission dismissal or arbitrary button tap.

After the single ordinary deny tap, native prompt presence is a failed measured
observation. A retained prompt does not itself prove whether a new Activity or
the prior dialog was present; the report states exactly what was measured.
Do not repair production camera behavior under this packet. Any observed
source fault needs a narrow source-owner fix, a new canonical pin and rerun.

`provenance.json` hashes the canonical source, original controller inputs and
this prepared packet. `preparation-check.json` records local syntax, parser
tests and read-only provenance validation. These are preparation checks only:
they are not native UI results. Later `observations.json`, native permission
lines, actual XML and PNGs establish only the cases truly observed. The follow-up
does not prove successful barcode recognition, working granted-camera hardware,
wallet custody/persistence, live-network behavior,
iOS coverage or the full app test suite.
