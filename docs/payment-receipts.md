# Mobile payment receipts

`/payment-receipt` displays a typed snapshot of the reported payment outcome. The existing `/payment-success` route renders the same screen for compatibility; the route name alone never implies confirmation.

## Navigation and status

The review screen opens a successful receipt after the send operation reports confirmation. Its final error/cancellation actions include **View Receipt**: a locally cancelled request is rejected, while an unconfirmed signing/submission error remains unknown. Opening this view does not resubmit a transaction. History's transaction-detail screen offers **View Receipt**, including pending and explicitly unsuccessful transactions.

The shared status mapper supports `successful`, `pending`, `failed`, `rejected`, and `unknown`. A pending flag takes precedence over legacy success flags; otherwise an explicit network success/failure flag takes precedence over a status label. Missing or unrecognized status is unknown, not successful. Rejected describes a request cancelled or rejected before submission, not proof of a failed on-chain transaction. A timeout is not evidence that funds were never sent.

The screen shows amount, asset, recipient, recorded timestamp, network, and transaction hash where available. Missing or malformed values show an unavailable state. Amount formatting preserves decimal strings rather than converting to floating point. The timestamp records the outcome snapshot and is not necessarily the ledger close time.

## Public-data boundary and explorer

`createReceiptParams()` whitelists the seven public receipt fields. Never forward a wallet secret, signed envelope, signer result object, or raw error. Arrays/repeated URL parameters and malformed scalars are discarded. Recipient screening accepts public account shapes only; it is not checksum validation or recipient verification. Hash and amount formatting checks are likewise not ledger validation.

Explorer links require a 64-character hexadecimal hash and a recognized recorded network matching the app's configured network. Public/mainnet aliases and testnet are supported; custom networks, missing hashes and mismatches show an unavailable explanation. Device link failures and clipboard failures produce user-visible feedback.

Old history records without a network tag inherit the active app configuration, as the existing history flow does; their original network cannot be reconstructed from those records. Do not treat a receipt or a manually entered route as independent proof of settlement. Receipts do not poll, persist outcomes across application restarts, or automatically retry a payment. Use **View Activity** or the explorer to check later confirmation.

## Focused checks

```sh
npm test -- --runInBand __tests__/paymentReceipt.test.ts __tests__/paymentReceiptScreen.test.tsx
```

The model tests cover five statuses, legacy flag precedence, malformed parameters, public-only serialization, exact decimal amounts, and explorer network matching. Screen tests cover all five outcomes, missing data, unsupported explorers, link/copy failures, and activity/wallet actions.

For device verification, send a testnet payment and open its receipt, open a pending history record, and open an unknown result without retrying the payment. Verify labels, long public addresses, network/date/asset, clipboard feedback, and explorer failure feedback. These are testnet/manual checks, not a request to send real funds.
