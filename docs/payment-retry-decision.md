# Uncertain payment results

The `/payment-retry` route handles a payment whose submission response was lost.
It says **Payment Status Unknown**, explains that the payment may have completed,
and offers **Check Status**, **View Payment Details**, **Get Help** and **View
Activity**. It never signs, builds, sends or automatically retries a payment.

## Submission and lookup contract

- The existing local XLM service builds and signs the transaction, computes its
  hash, and completes the SDK's recipient memo-required check before broadcasting.
  A preparation or memo-check failure is not an unknown submission.
- Once submission begins, a lost response (including timeout, connection failure
  or abort) retains the hash and original review in the signer store. Only an
  explicit Horizon HTTP 400 transaction result code is treated as rejection.
- A global active attempt prevents a second review/submission after navigation
  or a rapid second tap. The original review survives remounting; an accepted
  response remains accepted even if local pending-history bookkeeping fails.
- **Check Status** makes a read-only Horizon transaction-hash query. A matching
  record with `successful: true` confirms completion; `successful: false`
  confirms failure. A 404, missing outcome or lookup error leaves status unknown.
  Provider payloads are not displayed. Checks run only on user request and cannot
  overlap; there is no background poll or automatic timeout-to-failure rule.
- The decision keeps the original amount, recipient, network and hash available.
  Activity navigation preserves unresolved context. A definitive result plus
  **Done** clears it. Without a hash, the screen guides users to Activity and
  recipient/support confirmation instead of guessing a result.

## SDK retry assumptions

The current app uses `@stellar/stellar-sdk`'s synchronous Horizon
`submitTransaction`, rather than a PocketPay SDK retry helper. The implementation
retains the recipient memo-required check and uses `skipMemoRequiredCheck` only
after that same check has completed explicitly.

Horizon describes timeouts as uncertain and supports safe resubmission of the
**identical signed transaction**. This app does not retain the signed envelope,
so this screen intentionally offers no resend action. Building a fresh payment
can create a different transaction and is not equivalent to retrying the original.
No sequence-number or idempotency guarantee is inferred from a failed request.

Primary references: [Horizon submission error handling](https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/error-handling),
[synchronous transaction submission](https://developers.stellar.org/docs/data/apis/horizon/api-reference/submit-a-transaction),
and the installed SDK's Horizon `submitTransaction` / `checkMemoRequired` implementation.

## Limits and verification

Recovery is scoped to the current app session. A cold restart loses this volatile
review/hash context; users must check Activity and confirm the result before
creating another payment. Durable recovery and a broader transaction queue are
separate work. The store contains public transaction metadata, never a secret key,
recovery phrase or signed envelope. **Get Help** provides guidance without sending
data to an external support endpoint.

Focused service, screen and navigation regressions are in
`paymentSubmission.test.ts`, `paymentRetry.test.tsx`,
`review-transaction.negative.test.tsx` and `signerStore.submission.test.ts`.
They cover preflight failures, unknown responses with retained identity, 404 and
network lookup errors, definitive outcomes, overlapping taps, stale lookup
results, navigation/remounts and local bookkeeping failure. These use dummy
metadata and mocked transport; they do not broadcast transactions or demonstrate
a device/emulator run. Native UI screenshots and device verification must be
recorded against the final source before the contributor readiness checklist is
marked complete.
