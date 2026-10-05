# Baseline native observations

Prepared for `52ce8006a2d091a4c9f29852a1a530750ff9b3cc`, tree
`b7556026e93c5930915d12fdf51d421773c5f61e`. **Device execution is pending.**
This directory contains a validation controller fixture, not product code.

## Custody and setup

Dedicated manual validation controller branches and lab bundles may retain this
fixture. Exclude it from product, prerequisite and feature branches/PRs and
production app distributions. Preserve the tested product tree separately.
Use an explicitly disposable checkout whose 30 pinned production files match
`source-manifest.json`; setup refuses mismatches and existing fixture files.

```sh
python3 /tmp/pocketpay-baseline-native-evidence/setup-validation-checkout.py /path/to/disposable/native/checkout
```

Setup adds six fixture files, backs up the normal package manifest as
`native-baseline-package.original.json`, and temporarily sets `main` to
`./native-baseline-entry.js`. It installs the route at
`app/send/__baseline-native-fixture.tsx`. The existing production `app/send.tsx`
is untouched. Existing RootLayout's `send` exemption permits deliberate missing
wallet state without adding a special authentication bypass to product code.

Run the normal native development/Expo Go setup with:

```text
EXPO_PUBLIC_STELLAR_NETWORK=TESTNET
EXPO_PUBLIC_VAULT_ENABLED=true
```

Leave `EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE` unset or use the exact SDK Testnet
passphrase. Start the normal dev server with a cleared Metro cache. The fixture
imports the existing shim before the memory adapter, guards and router. It is
not suitable for a production-mode diagnostics run: the real DiagnosticsScreen
is development-only.

For an Expo Go guest, use the runner's server address, for example
`exp://<server>:8081/--/send/__baseline-native-fixture?case=history`, rather than
the installed-app scheme shown in the case examples below.

After the run, stop/force-stop the process and restore the package backup and
remove all six fixture files plus the backup before returning to a product
checkout. Restart through the normal entry. Do not call the underlying vault
initializer's `restore()` as baseline cleanup: the additional baseline Share,
Clipboard and generation wrappers require a full process restart.

## Boundaries and counters

Production visible screens, modals, theme hooks, search logic, router hooks,
focus hooks and network state hooks are unchanged. The fixture supplies only
explicit dummy dependencies and labeled host controls. It seeds a fixed dummy
Testnet wallet/contact, overrides native AsyncStorage with an in-process Map,
blocks wallet saves and clipboard writes, and returns no secret from the wallet
store. All network writes are blocked before dispatch, including Horizon/RPC,
fetch and native XHR. Only the real reachability hook's HEAD request receives
canned success; other external requests fail. Dummy read-only ledger responses
permit the real review route to render. These dependencies are part of the
fixture, not a live service result.

The banner and `POCKETPAY_BASELINE_NATIVE_FIXTURE` console records report current
counters. The shared `POCKETPAY_VAULT_NATIVE_FIXTURE` transport records prove
blocked attempts; expect `secretAccess=0`, `broadcastAttempts=0`, deposit=0 and
withdraw=0 in all prescribed baseline cases. A blocked attempted action is an
unexpected interaction, not a successful signing/persistence proof. Logs contain
dummy public addresses and counters, never a secret or diagnostics payload.

The legacy `src/features/contacts/store/useContactStore.ts` storage conversion is
an unreferenced module/type contract repair. This fixture does not import it and
does not claim app boot coverage or a native migration for it. Active picker
cases use the actual `src/features/contacts/contactStore.ts`.

## History: missing to hydrated on the same mounted host

Open the native route with `case=history`:

```text
stellar-pocketpay://send/__baseline-native-fixture?case=history
```

Wait for the real missing-wallet Activity state. Capture its UI and the banner
(`historyMounts=1`, `unmounts=0`). Tap the labeled fixture control **Hydrate DUMMY
wallet**. Capture the real Activity screen, filters and one dummy received
payment. Select Received/Sent if useful. Tap **Remove DUMMY wallet** and capture
the actual missing-wallet state again. Keep the route and selected case stable;
do not navigate away between transitions.

The same `<HistoryScreen />` element keeps its type, position and key while its
real wallet store subscriptions rerender. Host mount/unmount counters are
supporting evidence, not an instrumented internal screen lifecycle. The fixture
also changes the initial wallet restore dependency so RootLayout's delayed
initializer preserves a deliberate null wallet. A recorded native transition
without hook-order errors and without navigation/remount is needed before
claiming device coverage; an empty Activity screenshot alone is insufficient.
The existing Jest hydration regression remains the automated proof until then.
There is no live history fetch, pagination, pending-payment delivery or durable
wallet restoration proof in this case.

## Diagnostics: real loading/readiness and native share sheet

Open `?case=diagnostics` on the same native fixture route. Capture **Loading
diagnostics...** if observable, then the actual Diagnostics screen and Secure
Storage readiness. The unchanged screen calls the actual native SecureStore API
to write/delete its harmless `__diagnostics_test__` sentinel. It reads no wallet
secret. The transient loading view can complete too quickly for a screenshot;
do not claim measured loading UI unless observed. Do not replace this probe or
its UI with mocks or artificially change its timing.

Open `?case=share`. The actual `ErrorBoundaryFallback` receives harmless error
`DUMMY_NATIVE_DIAGNOSTICS_FIXTURE`; the fixture does not throw an app failure.
Tap the production **Share Diagnostics** button, capture the real native OS
share sheet, and cancel using the OS back/cancel control. Never select a target
or send diagnostics externally. The actual async builder uses
`SecureStore.isAvailableAsync()`, a native capability check with no stored-value
read. The Share observer verifies resolved string JSON and omitted dummy full
keys/balance fields before delegating to the real `Share.share` method.
Expect `shareCalls=1`, `shareStringPayload=1`, `shareRedactedPayload=1` and a
`native-share-sheet-requested` record. OS cancellation may not produce an
Android dismissed action; document the visible cancel/return instead of claiming
delivery or a particular API action. Fallback buttons other than Share are
outside this case.

## Create, Import, Sign Confirmation and Contact Picker

See `native-cases-README.md` for exact route queries and real native actions.
Create stops after one Generate Keypair tap with the production secret view
masked; never tap Reveal/Continue/Copy. Import uses empty input,
`DUMMY_INVALID_SECRET` and `SINVALID` only. No valid secret is imported or saved.
Sign uses dummy public addresses and the real Cancel Signing dialog/Sign
Transaction navigation. Stop on the actual Review route before Sign & Send.
Counts measure distinct focused review route keys, not intercepted router
pushes. The observer stays registered for the fixture process because production
RootLayout's Slot unmounts the previous route host when Review opens. It uses
global counters and replaces its listener if the native navigation ref changes;
full process restart resets it. Repeat/back-focus behavior must be observed on the guest before claiming
a native navigation-lock result. Contact Picker exercises its actual search,
optional edit callback, selection and confirmation dialog with dummy contacts;
all contact mutations stay in the Map-backed store. Clear search before reopening.

## What remains unproved

No fixture native run has occurred at preparation time. Screenshots, UI dumps,
timestamped real taps and console counters must come from the runner. These
cases do not prove live custody, randomness, signing, broadcast, secret storage,
successful import, durable contacts across restart, network retries or all app
flows. Camera/retry controllers are owned by their separate lanes. The separate
Vault fixture remains in `/tmp/pocketpay-vault-native-evidence`; it measures real
Confirm Lock dispatch/receipt under the same dummy boundaries.

`fixture-manifest.json` records hashes and completed local preparation checks.
Do not replace native contributor requirements with these local checks.
