import { useMemo } from 'react';
import type { NetworkState } from '../types/network';
import {
  resolveBalanceRefreshState,
  type BalanceRefreshState,
} from '../types/balanceRefresh';

interface Options {
  isLoading: boolean;
  error: string | null;
  lastRefreshed: number | null;
  networkState: NetworkState;
}

/**
 * Separate fetch freshness from the wallet's numeric balance state.
 * A previously verified amount remains useful, but must be labeled stale.
 */
export function useBalanceRefreshState({
  isLoading, error, lastRefreshed, networkState,
}: Options): BalanceRefreshState {
  return useMemo(
    () => resolveBalanceRefreshState({
      isLoading,
      error,
      lastRefreshed,
      offline: networkState === 'offline',
    }),
    [isLoading, error, lastRefreshed, networkState],
  );
}
