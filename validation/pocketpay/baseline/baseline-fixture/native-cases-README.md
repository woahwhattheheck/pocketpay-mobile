# Native Create, Import, Sign and Contact Picker cases

Validation-only helpers for baseline `52ce8006a2d091a4c9f29852a1a530750ff9b3cc`.
Install `native-baseline-cases.tsx` at the validation checkout root. The common
`app/send/__baseline-native-fixture.tsx` route imports the named exports from
`../../native-baseline-cases`. Never add these fixtures to the product patch.

The helpers render the unchanged production CreateWalletScreen,
ImportWalletScreen, SignConfirmationScreen and ContactPicker. They do not
replace `useRouter`, `useLocalSearchParams`, `useFocusEffect`, confirmation
dialogs or the picker search logic. Only the picker host and navigation
observer are fixture code.

## Bootstrap contract

Before loading Expo Router or these helpers, the common entry installs its
memory storage adapter, fixed dummy keypair generation, blocked secret access,
blocked clipboard and blocked signing/broadcast transports. Wallet save must
return `false` and record the attempt without persistence. Feature contact
store hydration must finish before contacts are seeded; its persistence key is
`pocketpay-contacts` and its records use `address`. Sign labels use the separate
appStore contact records with `publicKey`.

Do not render a case until the common fixture snapshot reports `ready: true`.
The helper reads this common global API:

```ts
globalThis.__pocketBaselineNativeFixture = {
  counters: Record<string, number>,
  publicKey: string,
  destinationPublicKey: string,
  log(event: string, details?: Record<string, unknown>): void,
  // Common route also owns snapshot(), subscribe() and its readiness gate.
};
```

`log` should emit a fresh snapshot after helpers increment counters. Neither
helper logs nor the common snapshot may contain a secret. Picker callbacks
increment `pickerSelect`, `pickerCancel`, `pickerAddNew` or `pickerEdit`.
`signReviewRouteEntries` counts distinct focused native review route keys.
The observer is installed once on the common global and survives host unmount:
production RootLayout uses Slot, which selects the active route. It does not
intercept navigation or change a production hook. A changed navigation ref
disposes the old listener before replacement. Reset by stopping the process and
restarting through the normal entry; it deliberately has no host effect cleanup.

## Native steps and observable results

Open `stellar-pocketpay://send/__baseline-native-fixture?case=create`.
Capture the actual initial Generate Keypair screen. Tap Generate Keypair once,
then capture the actual public address, warning and masked Secret Key view.
Expect one dummy generation and zero wallet-save, secret-access, clipboard,
signing and broadcast attempts. Stop before **Reveal** and **I've Saved It —
Continue**. The fixture deliberately keeps the production reveal control; its
default mask is what this case observes.

Open `stellar-pocketpay://send/__baseline-native-fixture?case=import`.
Capture the unchanged Import form, press Import Wallet with an empty field and
check “Please enter your secret key.” Enter `DUMMY_INVALID_SECRET` and press
Import Wallet; check the “start with S” validation message. Clear the field,
enter `SINVALID` and check the “too short” message. These invalid strings are
not keys. Expect zero wallet-save, secret-access, signing and broadcast
attempts. Valid import, SDK success and wallet persistence are outside this
case.

For Sign, use the actual common fixture public addresses as route query values:

```text
stellar-pocketpay://send/__baseline-native-fixture?case=sign&source=<publicKey>&destination=<destinationPublicKey>&amount=10&assetCode=XLM&memo=Native%20dummy%20review&fee=100&network=Testnet
```

The seed11/seed12 reference example is:

```text
stellar-pocketpay://send/__baseline-native-fixture?case=sign&source=GBTL47RTFR5EKMZSXWOQU735WBK7LRPPDIDK3JTNTCZZ7NUBBRDTVSK2&destination=GAFVCOWZWSJEAFOKBEBO2B4QITJ2YXN6YIYG6BUURQINVDVW4OPS3OL6&amount=10&assetCode=XLM&memo=Native%20dummy%20review&fee=100&network=Testnet
```

Capture Confirm Signing with the actual source/destination truncation, amount,
memo, fee and network. Press Cancel and inspect the actual Cancel Signing
dialog; Keep Reviewing must retain the screen and leave review entries at
zero. Press Sign Transaction once. Capture the actual Review Transaction route
and the common log entry containing its destination, amount and memo.
Expect `signReviewRouteEntries=1` and zero secret-access, signing and broadcast
attempts. Stop before the review screen's **Sign & Send**. Navigate back to
Confirm Signing and repeat only if testing its actual focus reset; a second
deliberate visit should produce a second distinct review route key. Opening
`?case=sign` without required query fields should show the actual Invalid
Transaction state.

Open `stellar-pocketpay://send/__baseline-native-fixture?case=picker`.
The actual native ContactPicker modal opens with dummy saved and recent rows.
Search for a seeded contact name, a substring of its address and an unmatched
term. Check the actual filtered rows and No contacts found state. Clear search
before subsequent checks because the production search state persists across
reopening the same mounted picker. Selecting a row closes the host and records
its exact dummy address once. The host can reopen with or without the optional
edit callback: edit icons must appear only when provided. Edit records the
selected contact without opening a contact form. Add New Contact and the close
icon each record their own callback. Delete opens the unchanged confirmation;
Cancel must preserve rows, while Delete changes only the memory contact store.
The common banner may be obscured by a native Modal, so capture callback counts
after it closes or use the timestamped fixture log.

## Limits and checks

These are native UI and hook observations under dummy dependencies. They do
not establish wallet generation randomness, custody, successful import,
cryptographic signing, network submission, persistence across restart or a
complete contact editor. Sign route entries are observed from the real native
navigation state; they are not a count of intercepted `router.push` calls.
Create's reveal and continue controls remain unchanged and are not exercised.

The helper passed an isolated TypeScript check using the baseline project's
real compiler options and actual imports, with zero diagnostics. No full test
run, emulator operation or product checkout edit was performed for these
helpers. `native-cases-source-manifest.json` records the baseline source and
helper SHA-256 hashes so integration can verify the production components
remain untouched.
