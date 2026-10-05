# Temporary native Vault evidence fixture

Prepared for product commit `52ce8006a2d091a4c9f29852a1a530750ff9b3cc`, tree
`b7556026e93c5930915d12fdf51d421773c5f61e`. This fixture must never be committed
to product, prerequisite, or feature branches, included in their PRs, or
distributed in production app bundles. Dedicated manual validation controller
branches and isolated validation app bundles may contain this fixture under the
root's authorization.

The production VaultScreen, useVaultAction, availability/capability/network
hooks, VaultConfirmModal and VaultReceiptModal remain byte-for-byte unchanged.
The fixture wraps the screen with a conspicuous dummy-data counter banner.
The actual production addLock action executes against a Map-backed AsyncStorage
adapter; no native storage is read or written. Dummy wallet balance is 100 XLM,
dummy vault balance is 25 XLM, and the vault remains honestly in mock mode.

Install only into a disposable native validation checkout. The setup verifies
eleven production file hashes, adds three fixture files, and temporarily selects
the fixture entry in package.json; it does not modify those production files.

```bash
python3 /tmp/pocketpay-vault-native-evidence/setup-validation-checkout.py /path/to/disposable/native/checkout
```

From that checkout, start Expo using the same tunnel/LAN configuration as the
existing native session, with these public Testnet settings:

```bash
EXPO_PUBLIC_STELLAR_NETWORK=TESTNET EXPO_PUBLIC_VAULT_ENABLED=true \
EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE='Test SDF Network ; September 2015' \
npx expo start --clear
```

Open `/__vault-native-fixture` through the resulting Expo development URL
(for example `exp://HOST:PORT/--/__vault-native-fixture`). The initializer runs
after the normal production shim and before the router loads. It supplies
memory-only initialization, suppresses the intro through its actual storage key,
and disables app lock. The real network hooks receive canned HEAD and Testnet
passphrase read responses. All other fetch/XHR requests, Horizon/RPC submissions,
deposit/withdraw methods, and secret access are blocked and counted.

Use native input/taps, with no programmatic confirmation-handler invocation:

1. Capture the dummy banner with addLock/deposit/withdraw/secret/broadcast
   counters at zero.
2. Enter `10` into the production Amount field and press **Set Aside for 30 Days**.
3. Capture the actual confirmation modal: **Confirm Lock**, amount 10, Action
   Lock, unlock date, Testnet/mock disclaimer. Action counters must still be zero.
4. Tap the lower **Confirm Lock** button once. The title has the same text;
   target the actual lower button. Capture the actual processing state if useful.
5. Capture the actual **Transaction Receipt** showing action `lock`, amount
   `10 XLM`, status `Success`, and hash `mock-lock`.
6. Press **Done** and capture the banner: addLock=1, deposit=0, withdraw=0,
   secretAccess=0, broadcastAttempts=0, memoryLocks=1. The logs prefixed
   `POCKETPAY_VAULT_NATIVE_FIXTURE` include the amount, ISO unlock date and time.

Neither the fixture nor these checks have been executed in an Android guest yet.
Syntax checks pass; device evidence belongs to the subsequent native run. This
is controlled UI/dispatch/receipt evidence, not live balance, custody, signing,
contract, payment, or connectivity evidence. The receipt hash is the production
mock-mode sentinel. A single tap establishes the measured dispatch, not general
double-tap protection. The current production screen retains its separate local
empty/loading lock-list placeholder; this fixture does not prove a list update or
persistence across app restarts. The memory lock count only inspects this run.

Before any product commit or production distribution, stop Expo, restore package.json from
native-vault-package.original.json, and remove native-vault-entry.js,
native-vault-bootstrap.js, app/__vault-native-fixture.tsx, and the package backup.
The global fixture exposes restore() for a quiescent development session;
restarting the app without the fixture entry is the preferred full cleanup.

Additional prerequisite native coverage still to record, unless already captured:

- Create/import: render both real onboarding screens; generation/reveal and
  successful save navigate through the existing success route using only a dummy
  Testnet wallet; verify readable failure/retry behavior for rejected storage.
- History: same mounted screen moves from missing wallet to hydrated wallet and
  back without hook-order failure; actual empty guidance and loaded content remain
  valid. Controlled transactions must be labeled as dummy data.
- Diagnostics: development-only readiness screen renders with storage status;
  Share Diagnostics opens the real native sheet with resolved redacted text.
  Production mode still redirects. Controlled status is not proof of device
  secure-storage availability unless that native API is actually used.
- Sign confirmation: actual summary renders; a single continue tap navigates
  once, repeated taps while leaving cannot add pushes, and returning focus restores
  interaction. This navigation case need not sign or submit anything.
- Source-contract fixes: Send warning layout and Contacts search/edit availability
  should be visually inspected where exercised. Typecheck/export already establish
  static import resolution; they do not establish each native screen interaction.


Successor scope after failed run37379451997: this directory is an inactive
historical standalone scaffold. The active combined job installs the baseline
entry and its reviewed pre-load Stellar guard, then copies only this vault
route. The bootstrap here mirrors the active explicit write blockers, but this
standalone entry/setup has not received the pre-load seam and is not repaired
or validated for standalone use. Do not infer a standalone execution pass.
