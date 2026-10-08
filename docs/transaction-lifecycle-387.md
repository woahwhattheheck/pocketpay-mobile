# Mobile transaction lifecycle — issue #387

## State contract (source implemented)

`src/features/transactions/transactionLifecycle.ts` defines allowed transitions.
`src/store/signerStore.ts` consumes the transition policy and refuses to reset
an in-flight review when a second request is started. It also preserves the
original `TransactionReview.requestId` when updating a fee quote.

```
idle -> validating -> review -> handoff -> signing -> submitting
                                                 -> confirming -> completed
                                                 -> pending -> completed
                                                 -> unknown
```

A transaction may fail before signing or following **explicit network rejection**.
The `unknown` phase is deliberately distinct from `failed` or `cancelled`.
Signing and submitting cannot transition back to review or cancelled merely
because a client promise rejects. The store's `markUnknown()` and `markPending()`
are available for subsequent SDK/RPC outcome reconciliation. Only an
authoritative network response should resolve an uncertain transaction.
The `reset()` action refuses to silently clear pending/unknown state.

## Current integration gap — must be completed before sponsor submission

**This fork branch is a source bank and not an end-to-end #387 delivery.**
Existing `app/review-transaction.tsx` is still the upstream baseline, which
does not call `markUnknown` on ambiguous post-signing submission errors.
That screen currently awaits secret loading and fee fetch *before* acquiring
the store handoff, calls `startReview` again after the fee quote, and maps
ambiguous errors to the `failed` panel. With the new guards, this second
`startReview` no longer overwrites the original review, so the quoted fee
will not be reflected until the screen calls `setReviewFee` instead.

Required integration: acquire `enterHandoff` synchronously before awaiting;
retain the initial request identity; call `setReviewFee` rather than restarting
review; transition through signing/submitting/confirming; map a promise rejection
after invoking the signing+submission service to `markUnknown`; offer
"check transaction history" rather than a blind retry; ensure any
acknowledged/rejected network outcome is reconciled by request ID. Update
signing and network error copy accordingly.

The existing `src/services/stellar.ts:sendXlmTransaction` combines signing and
submission within one promise and discards rejection metadata. A rejected
promise therefore cannot establish that submission did not occur. Do not
convert an unknown outcome into "never sent" without authoritative evidence.

## Focused tests and remaining verification

`transactionLifecycle.test.ts` asserts the lifecycle edges, late
cancellation prohibition, pending vs completed, and uncertain-result fence.
**Tests are authored, not run**. End-to-end SDK result mapping, native
screen integration, device cancellation behavior, and CI have not been
verified. This draft should not be represented as complete or payout-ready
until the remaining integration and required acceptance tests are delivered.
