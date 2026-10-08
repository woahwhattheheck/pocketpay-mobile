# Mobile balance refresh lifecycle (#526)

The home wallet reads the latest XLM balance and Horizon activity, but the display must not equate an old balance with a newly verified one. The status model in `src/types/balanceRefresh.ts` is independent from the existing numeric `BalanceState` and is surfaced through `useBalanceRefreshState` and `BalanceRefreshStatus`.

| Status | Trigger | Home behavior |
| --- | --- | --- |
| `idle` | No completed fetch or active request | Initial balance loading/refresh prompt |
| `loading` | Network request in flight | Spinner if no snapshot; retained last verified balance otherwise |
| `refreshed` | Successful fetch, timestamp present | Shows verified amount and timestamp |
| `stale` | Fetch error but a prior verified timestamp exists | Shows prior amount **with stale warning** and manual retry |
| `failed` | Fetch error with no previous verified timestamp | No numeric estimate; failure feedback and retry |
| `offline` | Connectivity hook reports device offline | No refresh attempt on retry; connection recheck first, retained amount labeled as not live |

The status banner never displays raw network error details or wallet secrets. A cached snapshot is not a claim of current network state. The existing `BalanceDisplay` remains responsible for the numeric amount and fallback initial loading/unavailable presentation.

## Retry and reconnect

- The home refresh button prevents concurrent retries using both the wallet's `isLoading` flag and an immediate ref lock while refresh + funding status requests settle.
- When device connectivity is known offline, Retry only asks the network hook to recheck connectivity. It does not trigger a Horizon balance request.
- When connectivity returns after an observed offline state, Home triggers one refresh. Subsequent renders do not continuously fetch.
- Offline and stale UI preserves last verified balance and `lastRefreshed`, instead of presenting cached value as freshly confirmed.
- Existing wallet store fetches and reconciliation behavior remain unchanged; the UI is additive and preserves older balance components and public interfaces.

## Focused regression

`src/types/__tests__/balanceRefresh.test.ts` asserts all six states, error-vs-stale classification, offline priority, and no-parallel request admission. Run only that focused test when required:

```bash
npm test -- --runInBand src/types/__tests__/balanceRefresh.test.ts
```

This contribution does **not** claim an instrumented device/network integration run or any payment award. Reconnecting and canceling requests beyond the home view remain wallet-store responsibilities for later general robustness work.
