# Secure payment signing confirmation (#388)

The existing XLM confirmation screen now treats route parameters as untrusted
display hints. It will only offer the signing transition when the request's
source matches the current wallet, the asset is XLM, the network matches the
configured Stellar network, and the destination, amount (including spendable
balance/reserve), and memo satisfy the existing payment validators.

At the approval tap it re-reads the current wallet and repeats the check, so a
wallet change since render cannot authorize a stale request. The next screen
still independently reviews and signs: this page does not sign or submit.

The previous confirmation screen displayed a query-string-provided fee
(`fee=100` from the send screen). That number was not derived from the
network and could be forged by a deep link. The UI now labels the fee as
calculated at signing; the downstream screen uses its own fetched base fee.

Focused regression: `__tests__/signingConfirmationGuard.test.ts`.
Covers valid requests, wallet switch, array-valued routes, network/asset
mismatches, invalid addresses, amounts, balance reserve and memo length.

Scope: XLM payments only, not a completed vault approval flow. Existing
`app/review-transaction.tsx` and other contributors' work are unchanged.
The upstream grant/compensation application remains separate.
