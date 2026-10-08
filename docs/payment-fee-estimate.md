# Payment fee estimate on transaction review

The transaction review screen asks Horizon for the current Stellar base fee while
the user is reviewing a payment. This is an **estimate for review**, not a fee
quote or a separate approval step.

## User-visible states

The review always includes an `Estimated fee` row before the user confirms:

- `Estimating…` while the fee request is in flight.
- `~N stroops` when Horizon returns a positive base fee.
- `Unavailable` when Horizon rejects the request, returns an invalid value, or
  does not respond within the bounded lookup window.

Fee-estimation failure does not make an otherwise valid payment unusable. The
review explains that submission can continue and that transaction construction
will use the network fee available at that time.

## Integration assumptions

- The app uses `server.fetchBaseFee()` from the existing Stellar service as the
  review-time estimate source.
- The estimate is fetched once for the current review inputs and reused when the
  user confirms; confirmation does not perform a second fee-estimate request.
- The estimate is advisory. Network conditions may change between review and
  transaction construction.
- Failure details from the fee provider are not rendered to the user.
- The payment submission path remains responsible for building and submitting
  the transaction; this UI state does not override the transaction builder's
  network-fee behavior.

## Why the lookup is bounded

A fee estimate should improve review clarity without trapping the user on the
review screen. The lookup therefore falls back to `Unavailable` after a short
bounded window. A late response is ignored after that fallback or after the
screen is unmounted.
