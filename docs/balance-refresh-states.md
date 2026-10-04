# Balance refresh states

Issue #526 separates whether a numeric balance is usable from the state of the
latest refresh attempt. This lets PocketPay keep showing a safe cached balance
while clearly communicating that its network data may be stale.

## State model

| Refresh state | Balance presentation | User feedback | Retry |
| --- | --- | --- | --- |
| `idle` | No refresh has started yet | Balance not refreshed yet | Available when the balance card exposes refresh |
| `loading` | First load uses the existing balance loading state | Loading balance | No duplicate request while one is in flight |
| `stale` | Last known balance remains visible | Refreshing balance / showing last known value | Wait for the in-flight request |
| `refreshed` | Latest balance is visible | Balance refreshed | Normal refresh remains available |
| `failed` | Cached balance stays visible when one exists; otherwise balance is unavailable | Refresh failed | Retry |
| `offline` | Cached balance stays visible when one exists; otherwise balance is unavailable | Offline / last known value unchanged | Retry |

`BalanceState` answers whether the numeric balance is currently usable, while
`BalanceRefreshState` reports the refresh lifecycle. The home screen passes
both values to `BalanceDisplay`.

## Refresh behavior

- `refreshWalletData()` ignores an overlapping call while `isLoading` is true,
  so pull-to-refresh and retry cannot fan out duplicate Horizon requests.
- A wallet with no prior successful refresh enters `loading`. A wallet with a
  cached balance stays `available` and enters `stale` until the request
  finishes.
- Success stores the new balance, updates `lastRefreshed`, and enters
  `refreshed`.
- Network-offline failures enter `offline`; other refresh failures enter
  `failed`.
- Failed/offline refreshes do not erase a previously refreshed balance. The
  retry control calls the same guarded refresh path.

Focused state-transition coverage lives in
`__tests__/walletStore.balanceRefresh.test.ts`.
