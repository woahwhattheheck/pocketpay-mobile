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

## Signed source-account identity and final submit authority

The review initially captures `sourcePublicKey` and a stable request ID.
At approval the screen compares that source to the **live** wallet state, not
only a React render closure, then repeats that comparison after retrieving
the secret and after the asynchronous fee quote. The payment service now
accepts optional `expectedSourcePublicKey` and proves it matches the
actual public key derived from the retrieved secret **before** Horizon
account lookup or local signing. A stale wallet/secret cannot sign from a
different account just because the review had passed earlier validation.

Between signing and Horizon POST, the `onSubmissionStart` callback acts
as a final approval fence: it confirms the same request ID, live wallet
public key and `signing` phase. Explicit `false` aborts without calling
`submitTransaction`; the service emits a typed pre-submission
`PaymentSendError` with `submissionAttempted=false`,
`definitiveRejection=false`, and no pending/unknown transaction hash.
Existing callers that do not supply the optional bound source/callback
remain compatible. Once the network POST has begun, genuine lost responses
continue through the prior `unknown` status flow; none of these guards
represent a submitted hash as an accepted ledger receipt.

`__tests__/sendXlmSigningAuthority.test.ts` supplies four focused
regressions (mismatched signer, cancelled callback, accepted submit, and
old optional-caller compatibility). They were **authored, not executed**
here. Device/keychain/Horizon trials are still necessary before removing
the draft designation or representing the source as network-validated.

## Focused tests and remaining verification

`transactionLifecycle.test.ts` asserts the lifecycle edges, late
cancellation prohibition, pending vs completed, and uncertain-result fence.
**Tests are authored, not run**. Source mapping and screen integration are
implemented, but no physical-device signing, timeout simulation, release APK
or CI pass is claimed. Sponsor acceptance and reward remain conditional.
