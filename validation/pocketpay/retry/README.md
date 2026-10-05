# Retry gap followup: local preparation only

Source: `ddd56649099d1fc5763ef29af3bfba0363897bd6`, tree
`4e363d77915ca16d3490e677f78c6487aeeb7060`. Device execution is pending.
Publication and dispatch belong to the coordinated controller owner.

## Provenance and setup

The original `/tmp/pocket321-native-evidence/native-fixture.tsx` is copied
byte-identically as `fixtures/native-fixture.tsx` (SHA-256
`6fe32e79e5dc9c76144b28c9bf5a00bb4ee193e31a8cd205ac700aa964f090f9`).
Setup installs it at `app/send/__retry-gap-native-fixture.tsx`. Its historical
auth-group comment remains unchanged to preserve bytes; the actual install uses
the existing production RootLayout `send` exemption to avoid auth redirects.
The pinned native321 entry and bootstrap are also byte-identical to their
originals, recorded in `source-manifest.json`.

Standalone setup requires a clean, explicitly disposable checkout at the exact
source SHA/tree and verifies 15 pinned production files before adding fixtures:

```sh
python3 setup-validation-checkout.py /path/to/disposable/retry/source
```

Only temporary `package.json.main` changes among tracked product files. Added
files are the original route/entry/bootstrap, a separate observer module, a
separate observer launch route, and the package backup. This standalone setup
must run before any other fixture setup. For the coordinated primary+gap
controller, the owner may combine these copy destinations after one shared
clean-source guard and reuse the same pinned entry/bootstrap; do not overwrite
or silently accept different initializer bytes.

Use explicit `EXPO_PUBLIC_STELLAR_NETWORK=TESTNET` with the normal Expo Go dev
server and ADB reverse for port 8081. Start a case through:

```text
exp://127.0.0.1:8081/--/__retry-gap-observer-native-fixture?outcome=nohash
exp://127.0.0.1:8081/--/__retry-gap-observer-native-fixture?outcome=empty
exp://127.0.0.1:8081/--/__retry-gap-observer-native-fixture?outcome=mismatch
```

The launcher waits for actual `useRootNavigationState().key` **and** actual
`useNavigationContainerRef().isReady()`, observes real ready/state events, and
redirects once. There is no arbitrary readiness timer or router mock. It
installs guards/observation before replacing itself with the exact original
fixture route. Each independent case force-stops/restarts the disposable guest
app to reset process memory and observers.

## What is real and what is controlled

Production PaymentRetryScreen, its hooks, signer actions, status service, native
navigation, details UI, help alert and Activity screen are unchanged. The
original fixture supplies dummy uncertain metadata and a 1,600 ms controlled
Horizon read. A process-lifetime observer wraps that fixture read without
changing its response/delay and records actual invocation, elapsed time,
requested/returned hashes and unknown-submission object identity. It observes
real signer store changes and survives route unmount; saved transaction factories
are unwrapped on fixture restoration to prevent recursive wrapping.

The original bootstrap supported the separate primary signing experiment and
could return a fixed dummy secret. This gap launcher instead blocks secret
access, cryptographic Keypair signing, Horizon submission, RPC submission,
wallet save, external fetch and native XHR before dispatch. Only the unchanged
connectivity hook's HEAD receives canned success. Native screenshots and all
observer records must show no guarded attempts. No new payment is built or
signed in any prescribed gap case.

Run the UI script only inside the later coordinated guest run, with
`SOURCE_SHA` and `ARTIFACT_DIR` set by the wrapper. Bound the whole script using
the owner wrapper's timeout. Ordinary assertion failures retain their measured
failure and continue with the next independent force-stop/restart case. A secret
media guard or genuine unsafe guard/provenance condition stops further guest
interactions and marks remaining cases blocked/unattempted.
Local syntax/type preparation is not a native run.

## Measurements and limits

- **No hash:** actual guidance, absent Check Status, zero read calls, actual
  details without a hash, actual help alert/OK, actual Activity navigation while
  the same uncertain submission remains recorded.
- **Empty:** actual empty-session guidance, absent check/details/help actions,
  zero read calls, actual Activity navigation with no uncertain submission.
- **Mismatch:** one requested `a…a` dummy hash receives the original delayed
  `b…b` response with `successful=false`. The real service rejects mismatched
  identity; UI remains Payment Status Unknown with the safe lookup-error copy,
  and the same unknown submission/hash remains through details/help/Activity.
  Checking Status is optional evidence and claimed only if actual native XML
  observes it; the delay itself is measured from actual read events.

The helper taps only exact observed enabled clickable actions with a unique
720×1280 visible rectangle, rejecting disabled ancestors through the entire
hierarchy. It scrolls based on current hierarchy. It checks Expo developer chrome
before accepting a target; only actual SDK **and** Connected-to-expo-cli labels
permit a recorded Back dismissal. Captures/actions reject covered UI. It enters no
key or payment text, never touches Sign & Send, and opens no external recipient.
Guarded pre/post XML rejects raw Stellar secrets and revealed-secret labels
before retaining PNG data; device XML is removed after reading. Failure
captures use the same guard.

All counters come from one actual native observer prefix, including guards, so
no stale baseline transport snapshot substitutes for live guard events. The
observer logs only dummy metadata/counters; it never logs a secret, provider
payload or signed XDR. This does not prove live Horizon behavior, successful
submission, persistence/custody, cryptographic signing, or all navigation flows.
The four original primary retry outcome cases (unknown, error, confirmed, failed) remain a separate part of the
combined controller and must pass independently.

Dedicated manual validation controller branches and lab bundles may retain
this packet. Exclude it from product/prerequisite/feature branches and
production distribution. After measurement, force-stop the process, restore
the exact package backup, remove the fixture files and restart through the
normal entry. Do not rely on the original bootstrap's partial restore for
observer cleanup.
