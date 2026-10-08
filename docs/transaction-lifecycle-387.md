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

## Review-screen integration (authored; device proof outstanding)

The original-author source carrier wires the production review screen to the
typed state contract. Sign & Send acquires a synchronous request-ID-scoped
handoff lease before awaiting secrets or the fee quote; a duplicate tap or
stale review cannot invoke the payment service. Fee updates use setReviewFee,
preserving the original request identity.

The service signed-hash callback advances signing to submitting after local
signing and immediately before Horizon submission. A successful Horizon
response advances submitting to confirming to completed with the same request
ID. A definitive Horizon result-code rejection becomes failed. A lost response
after submission becomes unknown and cannot reset for retry; if a signed hash
is available, its optimistic wallet-history record is retained for later
reconciliation without claiming it was accepted.

Unknown and pending UI offer Check Transaction History, not Try Again. Back to
Edit cancels only during review and resets the safe cancelled state. Missing
secret and fee/preparation errors display pre-submission failure messages.
Raw secret-bearing errors are not logged by this screen.

Remaining acceptance: run focused transaction lifecycle/source and real-device
UI checks where a suitable environment exists. Confirm real Stellar Horizon
success, explicit rejection and lost-response outcomes; inspect wallet history
with actual accounts. No device result, end-to-end run or payment is implied.

## Focused tests and remaining verification

`transactionLifecycle.test.ts` asserts the lifecycle edges, late
cancellation prohibition, pending vs completed, and uncertain-result fence.
**Tests are authored, not run**. Source mapping and screen integration are
implemented, but no physical-device signing, timeout simulation, release APK
or CI pass is claimed. Sponsor acceptance and reward remain conditional.
