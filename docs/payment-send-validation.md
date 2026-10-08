# Payment send validation (GrantFox #520)

The mobile XLM send flow uses `validatePaymentSend` in `src/utils/validation.ts` at two points: (1) when leaving the send form and (2) immediately before the review screen obtains a signing key and submits. A disabled button is presentation only and is **not** treated as authorization or validation.

## Accepted inputs

- Recipient is a valid Stellar G-address and not the connected wallet.
- Amount is a positive decimal with at most seven fractional places, within the fetched XLM balance **minus the existing 1 XLM reserve**. Malformed or non-finite fetched balances fail closed.
- Optional memo fits the Stellar 28-byte UTF-8 text limit.

## Readiness and error handling

Payment is blocked if there is no connected account, funding status is not `funded`, balance state is not `available`, or network state is not `online`. Send form reports field-level errors; the final review uses the same validator and displays the specific failure rather than signing or submitting. The user can reconnect, fund the account, refresh wallet balance, or edit the payment. Reopening with stale route params does not skip these checks.

## Scope and verification

Focused regression: `src/utils/__tests__/paymentSendValidation.test.ts` covers valid values, address/self-send, amount, UTF-8 memo, bad balances, readiness lifecycle, and network failure states. Run `yarn jest src/utils/__tests__/paymentSendValidation.test.ts --runInBand --watchAll=false` from the project root where dependencies exist. No live transaction should be sent during tests. Network-hosted integration, full test suite, grant or payout acceptance are not established by this change.
