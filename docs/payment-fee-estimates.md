# Payment review fee estimates

The XLM review screen loads a fee before enabling **Sign & Send**. Loading,
unavailable, and failed estimates do not hide the payment details or disable
**Back to Edit**. Retry reloads only the estimate, never signs or submits a payment.
Network/invalid-response failures use user-facing copy, not raw server errors.
A request that has not completed within ten seconds becomes unavailable; late
responses cannot replace its result or a newer payment's quote.

## SDK assumptions

The current mobile integration uses `@stellar/stellar-sdk` Horizon
`server.fetchBaseFee()`, not the local `pocketpay-sdk` stub. It returns a positive
integer number of **stroops per operation**. The supported payment has one native
XLM payment operation, so that base fee is the displayed estimate. One XLM is
10,000,000 stroops. Zero, missing, fractional, non-finite and out-of-range values
are unavailable, not free payments.

This is an estimate, not an exact fee guarantee or a user-selected fee cap.
The existing `sendXlmTransaction` service obtains the network fee again when
building the transaction; this change does not alter signing or submission.
An estimate failure blocks only signing because this review must show a usable
estimate first. The user can always inspect the details, edit, or retry.

No generic multi-operation or Soroban fee is inferred from this base fee. Those
flows need their own SDK fee/simulation contract before reusing this display.

## Focused validation

`npm test -- --runInBand __tests__/PaymentFeeEstimate.test.tsx __tests__/ReviewConfirm.test.tsx`
