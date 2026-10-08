# Signed payment submission: uncertain outcomes

PocketPay distinguishes three outcomes when submitting an XLM payment to Stellar Horizon:

| Outcome | Evidence | Screen |
| --- | --- | --- |
| Confirmed | Horizon accepted the signed payment, or a later lookup reports `successful: true` | Transaction Confirmed |
| Rejected | Horizon provided an explicit `tx_...` result code, or later hash lookup reports `successful: false` | Transaction Failed/Rejected |
| **Status unknown** | Horizon submit threw after the transaction was signed, without an explicit result code | **Status Unknown**, never an automatic retry |

## Resolving "Status Unknown"

The signed transaction hash is deterministic and contains no secret key. The app
retains it in the local pending-payment list and offers **Check Status**. That
action queries the configured Horizon network using the *same hash*: it does
not sign or transmit another payment. **View Details** reveals the public
hash, selected network, recipient and amount for independent reconciliation.

A Horizon HTTP 404 means **not yet found**, not "safe to resend": ingestion,
network failures and eventuality can delay visibility. Other lookup failures
are marked temporarily unavailable. Recheck history or share the **public**
hash with support; never share a seed, secret key or signed envelope.

Preparation errors happen before `submitTransaction` and can be reported as
"not submitted." Error logs must not dump raw signing/network error objects.
Unknown submissions should be resolved before the user creates a replacement
payment; navigating away from the review screen does not issue a retry.

## Source and focused regression coverage

- `src/services/stellar.ts`: preparation vs. explicit Horizon rejection vs.
  uncertain post-sign submission, deterministic hash, safe same-hash lookup.
- `app/review-transaction.tsx`: unconfirmed warning, Check Status, View
  Details, and no re-sign while status remains unknown.
- `src/store/walletStore.ts`: mark uncertain hash pending; remove that entry
  only on definitive rejection while preserving other pending payments.
- `__tests__/stellar.submission-uncertainty.test.ts`,
  `__tests__/review-transaction.negative.test.tsx`,
  `__tests__/walletStore.pendingTransactions.test.ts`: focused cases authored.

No assertion of deployed mobile-device verification, broader test results,
Horizon acceptance or bounty payout is made by this source change.
