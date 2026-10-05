# Balance refresh

The Home screen exposes the balance read lifecycle separately from the balance
value. `src/types/balanceRefresh.ts` defines the transition model;
`walletStore` executes reads; `useBalanceRefresh` connects the existing
connectivity signal and app lifecycle to the model. `BalanceRefreshFeedback`
provides status text and an accessible refresh button.

| State | Meaning and behavior |
| --- | --- |
| `idle` | No balance read has completed for this wallet. The default numeric value is not presented as a verified balance. |
| `loading` | One refresh is active. Repeated store calls share its promise; the screen disables repeated refresh actions. A previous successful balance stays visible. |
| `refreshed` | The balance read succeeded. Its success timestamp is updated, even when the independent activity read failed. |
| `stale` | A successful balance is at least 60 seconds old, or connectivity returned after going offline. The cached value is explicitly marked as possibly outdated. |
| `failed` | The balance read failed or timed out. The previous successful value and timestamp are retained, with a manual retry. |
| `offline` | The existing connectivity hook reports offline. Balance refresh sends no requests, invalidates any pending result, and explains whether a cached value is available. |

## Refresh and retry behavior

Mounting Home, changing wallet, or reconnecting initiates one refresh. Pull to
refresh and the status button use the same store action. This feature does not
add a network polling loop or automatic retry loop. A one-shot local timer marks
an old balance stale; foregrounding the app rechecks its age without fetching.
Connectivity is supplied by the existing `useNetworkState` hook.

Each balance/activity read has a 15-second result timeout. This releases the UI
for a manual retry; it does not abort the underlying Horizon transport. Late
results are ignored. Failures settle the store action rather than leaking an
unhandled rejection to a button callback.

Balance and activity results are classified independently. An activity error
preserves previous records and pagination without discarding a successful
balance. A balance error does not discard successfully refreshed activity.
Optimistic pending transactions are reconciled using the current pending map,
including entries added while the refresh was running.

Wallet replacement, clearing, and restoration reset balance provenance and
advance the request generation. Old responses cannot populate the new wallet,
even when the same public key is selected again. An older pagination request
cannot overwrite a newer first-page refresh. Key storage format, signing, and
payment submission behavior are unchanged.

The last successful value is an in-memory cache, not persistent offline storage.
A successful zero balance does not alone establish that an account is funded:
the existing balance service also returns zero for a not-yet-created account.
The separate account funding check remains responsible for that distinction.

## Focused checks

After installing the repository dependencies:

```sh
node --test tests/balance-refresh.test.cjs
npm test -- --runInBand __tests__/home.pullToRefresh.test.tsx __tests__/balanceRefreshFeedback.test.tsx
```

The Node checks transpile the production TypeScript with the project's
TypeScript dependency and exercise the reducer plus the store with explicit
storage, service, and Zustand get/set doubles. They cover success, stale aging,
failed retry, single-flight behavior, bounded timeout, partial activity failure,
offline/reconnect, wallet replacement, and pagination races. They do not replace
React Native integration or device validation. The Jest checks cover Home wiring
and accessible status/retry feedback.

For device review, confirm that pull-to-refresh and the button do not duplicate
requests; an existing balance remains visible during refresh/failure/offline;
staleness is shown after one minute or a foreground return; reconnect recovers;
and a wallet switch never flashes the old wallet's balance. Check VoiceOver or
TalkBack announcements, disabled/busy states, and the existing button touch
target. Use testnet fixtures only, with no recovery keys in recordings.
