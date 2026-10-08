# Secure payment signing confirmation (#388)

The existing XLM confirmation screen now treats route parameters as untrusted
display hints. It will only offer the signing transition when the request's
source matches the current wallet, the asset is XLM, the network matches the
configured Stellar network, and the destination, amount (including spendable
balance/reserve), and memo satisfy the existing payment validators.

**Fail-closed source and balance verification:** The active wallet public key
must itself be a valid Stellar public address, not merely string-equal to
a forged or stale route source. Supported signer network labels are only
`Testnet` and `Public Network`; an unsupported configured network does
not become safe merely because a deep link echoes it. The observed wallet
balance must be a finite nonnegative decimal with no more than seven places.
Missing values, `NaN`, `Infinity`, negative or malformed balances and
over-precision fail before approval. Without reliable spendable-balance
data the user must refresh the wallet; approval cannot proceed on a
comparison against `NaN`. This guards against impossible insufficient-fund
comparisons and unknown signer network assumptions.

The consent network is derived from the **same network passphrase used by the
signing service**, not from the display-only network label. The signing service
uses `EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE` and falls back to the Stellar
Testnet passphrase when it is absent. If `EXPO_PUBLIC_STELLAR_NETWORK` is
explicitly configured, that label must agree with the passphrase-derived
network. A Public label with a missing/Testnet passphrase, a Testnet label with
the Public passphrase, or an unsupported custom passphrase fails closed before
any signing consent is shown.

At the approval tap it re-reads the current wallet and repeats the check, so a
wallet change since render cannot authorize a stale request. The next screen
still independently reviews and signs: this page does not sign or submit.

The previous confirmation screen displayed a query-string-provided fee
(`fee=100` from the send screen). That number was not derived from the
network and could be forged by a deep link. The UI now labels the fee as
calculated at signing; the downstream screen uses its own fetched base fee.

Focused regression: `__tests__/signingConfirmationGuard.test.ts`.
Covers valid requests, wallet switch, array-valued routes, network/asset
mismatches, invalid addresses, amounts, balance reserve and memo length;
additional focused cases cover corrupt/overprecise balances, unsupported
matching-network labels and a malformed active wallet address.

Scope: XLM payments only, not a completed vault approval flow. Existing
`app/review-transaction.tsx` and other contributors' work are unchanged.
The upstream grant/compensation application remains separate.
