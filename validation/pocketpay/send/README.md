# Send embedded scanner preservation: local candidate, not executed

This separate candidate is pinned to canonical camera successor
`314b69b9a4ac4c4328540792fcc516e6ce5c6e16`, tree
`d024fbbd8393b855508da14a0b2fba9441c7a5f4`, the sole-parent successor of
`e92351b71869f6be89229511c9898e20d50369c9`. The denial repair changes
QrScanner; actual SendScreen and FormField are unchanged. The source manifest
pins 18 production files including Send, FormField, QrScanner, RootLayout,
wallet/network hooks and package metadata. Every future source change requires
read-only reinspection and a newly reviewed SHA/tree/manifest before execution.

No product file, frozen controller/fixture, Git ref, workflow or guest was
changed by this preparation. This candidate has no launch fixture, wallet
initializer, replacement UI, camera/permission hook mock or source patch.
Its guarded controller opens the existing actual `/send` route, which already
has a logged-out RootLayout exemption.

## One bounded later measurement

The controller will enter only this fixed checksum-valid public dummy address:
`GAFVCOWZWSJEAFOKBEBO2B4QITJ2YXN6YIYG6BUURQINVDVW4OPS3OL6`.
No secret/keypair is generated or supplied. The initial unique native EditText
placeholder `G...` is tied to the pinned production Destination Address field;
the exact visible label and three-field Send form are required. When native
compression preserves the form ancestor, that exact label must belong to the
same unique EditText. The amount and memo must remain empty. The field must be
enabled through its whole ancestor chain, non-password, editable and wholly
inside the verified 720x1280 viewport. The exact recipient must hold native
focus before `adb input text`; no clearing, clipboard, unrelated typing or
coordinate guessing is performed. During observed IME display only the actual
recipient field is required, since other fields may be covered; all three fields
and their empty amount/memo states are required before and after the scanner.
BACK dismisses the keyboard only if native `dumpsys input_method` unambiguously
reports it visible and a fresh guarded tree still shows the focused exact field.

The collector retains actual before XML proving the entire recipient
EditText value, with a contextual native PNG, then presses the exact native action
`Scan QR code for recipient address`. It requires the actual embedded
QrScanner `Camera unavailable` mount-error branch and current native CAMERA
`granted=true`. It presses the exact `Enter recipient address manually` action,
then retains actual after XML proving the same whole native recipient value
and field bounds, empty amount/memo and closed scanner. The production Send
Modal supplies `onClose` without `onManualEntry`; QrScanner's fallback therefore
calls the real `handleScanClose`, which only sets `isScanning=false`. There is
no restart or route navigation between the before and after measurements.
That source/flow evidence supports form retention; no instrumentation claims
to observe React instance identity directly.
The single-line field can horizontally clip the 56 characters in a PNG; full
equality is proven by native EditText XML, with screenshots supplying UI context.
If closing the real native Modal restores the recipient keyboard, the collector
first requires actual Send labels, the exact public native value, the scan action
and no scanner overlay. It then permits one BACK only with freshly observed
focused recipient and unambiguous visible IME, and requires IME hidden before
the full three-field after capture. Missing focus or ambiguous state stops it.

Only those two scanner actions and the recipient field are touched. No wallet
or contact is created/imported/saved; no amount/memo is entered; no Send,
Review, Sign, funding, retry, chain submission, share or clipboard action is
invoked. Real production startup/network hooks remain active and may perform
their normal reads. This packet does not claim instrumented zero network-call
counters, a barcode scan, a permission-denial result, or scanner loading coverage.

## Explicit prerequisites supplied by the coordinated runner

The runner must supply one exclusive disposable API34 emulator with no user
wallet/contact data, Expo Go54.0.8, effective size720x1280,
zero front/back camera hardware, a warm Metro port8081 serving the exact clean
canonical source, and its existing ADB reverse mapping. Actual OS CAMERA grant
must already have been observed and retained by a reviewed prerequisite case;
this collector never grants/revokes CAMERA, clears data or changes flags. It
reads actual package flags before Send, at unavailable and after fallback, and
reads the actual media.camera zero-device count. Any unexpected permission
dialog stops the case without permission interaction. The prior grant and fresh
no-wallet/no-hardware state are explicit owner-supplied prerequisites, not facts
manufactured by this collector.

The required prerequisite JSON is evidence metadata, never a fixture. Supply
these literal facts plus the actual native grant-dialog XML/PNG artifact paths
and their SHA-256 digests (no placeholders or invented receipt during execution):

```json
{
  "exclusiveDisposableEmulator": true,
  "freshGuestContainsNoUserWallet": true,
  "actualOsCameraGrantObserved": true,
  "frontAndBackCameraHardwareAbsent": true,
  "stellarNetwork": "TESTNET",
  "sourceSha": "314b69b9a4ac4c4328540792fcc516e6ce5c6e16",
  "serial": "EXCLUSIVE_ADB_SERIAL",
  "actualOsGrantEvidence": [
    {"path": "/absolute/retained/actual-grant-dialog.xml", "sha256": "ACTUAL_DIGEST"},
    {"path": "/absolute/retained/actual-grant-dialog.png", "sha256": "ACTUAL_DIGEST"}
  ]
}
```

The collector verifies every referenced artifact hash, guards retained XML for
secret/password content, requires an actual scoped permission-controller
foreground-allow button in one native XML and a PNG signature, and records the
receipt hash. Prior tap completion remains supported by the owner/primary
case's actual grant evidence; current `granted=true` is independently measured.
The runner must review the primary evidence and receipt before this case.
An existing runner `wm size 720x1280` override is accepted only when the
effective viewport is exactly720x1280; every actual screenshot's PNG IHDR must
independently report720x1280. No viewport/density mutation is performed here.

A later reviewed integration may invoke:

```sh
python3 send_preservation.py --serial EXCLUSIVE_ADB_SERIAL \
  --source-checkout /absolute/disposable/canonical-successor-checkout \
  --owner-prerequisite-receipt /absolute/evidence/actual-os-grant-receipt.json \
  --artifacts /absolute/new/evidence/send-preservation
```

No setup or collector invocation has occurred here. Source verification rejects
tracked changes and unexpected untracked files. It may allow only the existing
reviewed camera send wrapper with its immutable hash in a runtime checkout;
that unused wrapper never substitutes for the actual `/send` screen. A legacy
auth wrapper is permitted only during read-only preparation, never runtime.
The separate new candidate files stay outside product branches/app source.
An isolated validation-controller branch may preserve this packet for review;
it must not be included in prerequisite/feature product PRs or shipped bundles.

## Safety, local checks and limits

Every product capture and action rejects covered UI before accepting underlying
Send labels. Only an observed sheet containing both `SDK Version` and
`Connected to expo-cli` can be recorded and then dismissed with a scoped BACK,
at most twice. Native permission dialogs, unexpected foreground packages,
fatal/error/QR alerts, secret-shaped text and password UI stop measurement.
Exact action labels resolve to one enabled visible clickable native node or
its nearest clickable ancestor; full ancestry, unique target and complete
viewport bounds are checked. Screenshot bytes are retained only after both
fresh guarded XML observations satisfy the exact same state/value requirements.
Both scanner/manual taps and whole-form/scanner captures also require fresh
unambiguous native IME-hidden state; focused recipient entry is the only phase
that intentionally permits the keyboard.
Transient XML is deleted from the guest even on dump/read failures. Failure
handling never takes an unguarded screenshot or includes raw XML/error strings.

There is one 300-second wall-clock bound and at most12 seconds per ADB command.
Evidence must be in a new directory, never overwrite prior observations.
`observations.json` is independent of the original Contacts result, with its
own source/receipt, native prerequisites, last stage and preservation result.
Exit0 means this case passed; exit1 means an ordinary bounded observation or
exact-value assertion failed, with no unsafe condition detected. The owner may
then force-stop/reestablish prerequisites for a separate independent case;
exit1 never authorizes tapping whatever UI remains. Exit2 means a secret,
overlay, ambiguous IME, permission, invalid media/viewport, device, source
custody, receipt or transport condition blocked safe execution. The owner must
record remaining guest steps blocked/unattempted and stop rather than continue.
The Boolean `safeToAttemptNextIndependentCase` mirrors that convention.
An original Contacts success cannot substitute for this case's own success.
Invocation immediately after original Contacts-unavailable/manual and before
user-fixed revocation may use its actual prior Scan grant dialog XML/PNG and
native granted flags; no new grant is manufactured here.
Read-only parser tests and syntax checks exercise selector/guard behavior only.
They do not establish Expo runtime behavior. This is a frozen local candidate
for peer review, with no native success claim or dispatch/publication authority.
