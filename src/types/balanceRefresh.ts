import type { BalanceState } from './balance';

export const BALANCE_STALE_AFTER_MS = 60_000;
export const BALANCE_REFRESH_TIMEOUT_MS = 15_000;

export type BalanceRefreshStatus =
  | 'idle'
  | 'loading'
  | 'stale'
  | 'failed'
  | 'offline'
  | 'refreshed';

export interface BalanceRefreshState {
  status: BalanceRefreshStatus;
  requestId: number;
  /** Time of the last successful balance read, not the last attempt. */
  lastSucceededAt: number | null;
}

export const initialBalanceRefreshState = (): BalanceRefreshState => ({
  status: 'idle',
  requestId: 0,
  lastSucceededAt: null,
});

export type BalanceRefreshEvent =
  | { type: 'start'; requestId: number }
  | { type: 'succeeded'; requestId: number; now: number }
  | { type: 'failed'; requestId: number }
  | { type: 'offline' }
  | { type: 'online' }
  | { type: 'age'; now: number };

export function transitionBalanceRefresh(
  state: BalanceRefreshState,
  event: BalanceRefreshEvent,
): BalanceRefreshState {
  switch (event.type) {
    case 'start':
      if (state.status === 'offline' || event.requestId <= state.requestId) return state;
      return { ...state, status: 'loading', requestId: event.requestId };
    case 'succeeded':
    case 'failed':
      // Late completions cannot revive an offline, replaced, or newer request.
      if (state.status !== 'loading' || event.requestId !== state.requestId) return state;
      return event.type === 'succeeded'
        ? { ...state, status: 'refreshed', lastSucceededAt: event.now }
        : { ...state, status: 'failed' };
    case 'offline':
      return state.status === 'offline' ? state : { ...state, status: 'offline' };
    case 'online':
      return state.status === 'offline'
        ? { ...state, status: state.lastSucceededAt === null ? 'idle' : 'stale' }
        : state;
    case 'age':
      return state.status === 'refreshed' && state.lastSucceededAt !== null &&
        event.now - state.lastSucceededAt >= BALANCE_STALE_AFTER_MS
        ? { ...state, status: 'stale' }
        : state;
  }
}

/** Keep an actual successful value visible during retries and connectivity loss. */
export function balanceValueState(state: BalanceRefreshState): BalanceState {
  if (state.lastSucceededAt !== null) return 'available';
  if (state.status === 'idle' || state.status === 'loading') return state.status;
  return 'unavailable';
}

export function describeBalanceRefresh(state: BalanceRefreshState): string {
  const cached = state.lastSucceededAt !== null;
  switch (state.status) {
    case 'idle': return 'Balance has not been refreshed yet.';
    case 'loading': return cached
      ? 'Refreshing balance. Showing your last successful balance.'
      : 'Fetching your balance from the network.';
    case 'stale': return 'Balance may be out of date. Refresh to check the latest amount.';
    case 'failed': return cached
      ? 'Balance refresh failed. Showing your last successful balance. Please retry.'
      : 'Balance refresh failed. No balance is available yet. Please retry.';
    case 'offline': return cached
      ? 'You are offline. Showing your last successful balance. Reconnect to refresh.'
      : 'You are offline. Reconnect to fetch your balance.';
    case 'refreshed': return 'Balance refreshed successfully.';
  }
}

/** Bound a read without retrying it or allowing a late result to replace the UI. */
export function withBalanceRefreshTimeout<T>(
  promise: Promise<T>,
  timeoutMs = BALANCE_REFRESH_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Wallet refresh timed out. Please retry.')), timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}
