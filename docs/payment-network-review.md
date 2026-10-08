# Payment review network disclosure

Issue #318 — The payment review, signing-confirmation and settings screens
display a consistent **signing network** label via
`getPaymentNetworkInfo` in `src/utils/paymentNetwork.ts`.

- **Testnet:** identify test assets and require a Testnet recipient.
- **Public Network (Mainnet):** warn that real assets can move irreversibly.
- **Custom Network:** explicitly identify the nonstandard signing network and
  ask users to verify the passphrase and Horizon endpoint; don't fabricate an
  explorer link or show the raw passphrase.
- **Configuration mismatch:** show the network derived from the signing
  passphrase with a warning when `EXPO_PUBLIC_STELLAR_NETWORK` disagrees.

The signing passphrase comes from
`EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE`; when absent it defaults to
Stellar Testnet, matching `src/services/stellar.ts`. The display-only alias
`EXPO_PUBLIC_STELLAR_NETWORK` does not override what the service signs.
The signing screen deliberately ignores user-controlled URL `network` params.

These labels describe configured signing behaviour, **not** independently
verified network connectivity. A review screen does not prove that the Horizon
URL points to the selected network; network-passphrase validation remains a
separate service concern. Do not present real funds as safe solely because a
label says Testnet.

Focused regression file: `__tests__/paymentNetwork.test.ts`.
