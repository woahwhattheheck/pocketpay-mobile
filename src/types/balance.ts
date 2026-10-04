/**
 * Balance and funding state types for the wallet.
 *
 * Distinguishes between loading, unavailable (network error), zero balance,
 * and known positive balance so the UI can render distinct states instead of
 * conflating "no data" with "zero XLM".
 *
 * FundingStatus tracks whether the account exists on the Stellar network.
 */

/** The high-level state of the balance fetch lifecycle. */
export type BalanceState =
  | 'idle'        // No fetch has been attempted yet (e.g. boot before wallet check)
  | 'loading'     // A fetch is in-flight
  | 'available'   // Balance was fetched successfully (may be zero or positive)
  | 'unavailable'; // The last fetch failed (network error, Horizon error, etc.)

/** Human-readable description for each balance state. */
export interface BalanceStateCopy {
  title: string;
  message: string;
  /** A short label for a retry button action, or undefined if retry doesn't apply. */
  retryLabel?: string;
}

/**
 * Refresh-specific lifecycle for an existing wallet balance.
 *
 * This is separate from BalanceState: BalanceState answers whether a numeric
 * balance is currently usable, while BalanceRefreshState describes the most
 * recent refresh attempt. A usable cached balance can therefore remain
 * available while refreshState is stale, failed, or offline.
 */
export type BalanceRefreshState =
  | 'idle'
  | 'loading'
  | 'stale'
  | 'failed'
  | 'offline'
  | 'refreshed';

export interface BalanceRefreshStateCopy {
  title: string;
  message: string;
  retryLabel?: string;
}

export function describeBalanceRefreshState(
  state: BalanceRefreshState,
): BalanceRefreshStateCopy {
  switch (state) {
    case 'idle':
      return {
        title: 'Balance not refreshed yet',
        message: 'Pull down to load the latest balance.',
        retryLabel: 'Refresh',
      };
    case 'loading':
      return {
        title: 'Loading balance',
        message: 'Fetching the latest balance from the Stellar network.',
      };
    case 'stale':
      return {
        title: 'Refreshing balance',
        message: 'Showing the last known balance while the refresh completes.',
      };
    case 'failed':
      return {
        title: 'Balance refresh failed',
        message: 'The latest refresh failed. Your last known balance is unchanged.',
        retryLabel: 'Retry',
      };
    case 'offline':
      return {
        title: 'Balance refresh offline',
        message: 'No internet connection. Your last known balance is unchanged.',
        retryLabel: 'Retry',
      };
    case 'refreshed':
      return {
        title: 'Balance refreshed',
        message: 'Latest balance loaded successfully.',
      };
  }
}

/**
 * Whether the account exists on the Stellar network.
 * - 'unknown':  haven't checked yet (or network error prevented check)
 * - 'checking': in the process of checking account existence
 * - 'unfunded': account does not exist on the network yet
 * - 'funded':   account exists on the network
 */
export type FundingStatus = 'unknown' | 'checking' | 'unfunded' | 'funded';

/**
 * Returns user-facing copy for each balance state.
 * Safe to render directly — no raw error messages are surfaced.
 */
export function describeBalanceState(state: BalanceState): BalanceStateCopy {
  switch (state) {
    case 'idle':
      return {
        title: 'No balance data yet',
        message:
          'Your wallet balance has not been checked yet. Pull down to refresh.',
        retryLabel: 'Refresh',
      };
    case 'loading':
      return {
        title: 'Loading your balance',
        message: 'Fetching your latest balance from the Stellar network…',
      };
    case 'available':
      return {
        title: 'Balance available',
        message: '',
      };
    case 'unavailable':
      return {
        title: 'Balance unavailable',
        message:
          'We could not retrieve your current balance due to a network issue. Your funds are safe. Please try again.',
        retryLabel: 'Retry',
      };
  }
}
