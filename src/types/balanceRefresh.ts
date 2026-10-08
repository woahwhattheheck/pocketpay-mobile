/**
 * Balance refresh lifecycle, independent of the numeric balance.
 * A failed request must never turn a previously observed balance into zero.
 */
export type BalanceRefreshState =
  | 'idle'
  | 'loading'
  | 'stale'
  | 'failed'
  | 'offline'
  | 'refreshed';

export type RefreshFailure = 'offline' | 'stale' | 'failed';

/** Keep the last verified snapshot visible if a refresh fails. */
export function failedRefreshState(
  hasSnapshot: boolean,
  isOffline: boolean,
): RefreshFailure {
  if (isOffline) return 'offline';
  return hasSnapshot ? 'stale' : 'failed';
}

export interface BalanceRefreshCopy {
  title: string;
  message: string;
  canRetry: boolean;
}

/** Intentionally avoids raw network errors and wallet identifiers. */
export function describeBalanceRefresh(state: BalanceRefreshState): BalanceRefreshCopy {
  switch (state) {
    case 'idle':
      return { title: 'Not refreshed', message: 'Refresh to check your balance.', canRetry: true };
    case 'loading':
      return { title: 'Refreshing balance', message: 'Checking Stellar for the latest balance…', canRetry: false };
    case 'refreshed':
      return { title: 'Balance refreshed', message: 'Showing the latest confirmed balance.', canRetry: true };
    case 'stale':
      return {
        title: 'Balance may be out of date',
        message: 'Refresh failed. Your last confirmed balance is still shown.',
        canRetry: true,
      };
    case 'failed':
      return {
        title: 'Balance could not load',
        message: 'No verified balance is available yet. Try again.',
        canRetry: true,
      };
    case 'offline':
      return {
        title: 'You are offline',
        message: 'Reconnect to refresh. Any last confirmed balance is not live.',
        canRetry: true,
      };
  }
}

/** Do not start another network request while one for the same wallet is active. */
export function mayStartBalanceRefresh(
  state: BalanceRefreshState,
  isLoading: boolean,
  offline: boolean,
): boolean {
  return !offline && !isLoading && state !== 'loading';
}
