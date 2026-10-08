import {
  describeBalanceRefresh,
  failedRefreshState,
  mayStartBalanceRefresh,
  type BalanceRefreshState,
} from '../balanceRefresh';

describe('balance refresh lifecycle (#526)', () => {
  it('describes every required refresh state with safe user-facing feedback', () => {
    const states: BalanceRefreshState[] = [
      'idle', 'loading', 'stale', 'failed', 'offline', 'refreshed',
    ];
    for (const state of states) {
      const copy = describeBalanceRefresh(state);
      expect(copy.title).toBeTruthy();
      expect(copy.message).toBeTruthy();
      expect(copy.message).not.toMatch(/secret|seed|private key/i);
    }
    expect(describeBalanceRefresh('loading').canRetry).toBe(false);
    expect(describeBalanceRefresh('stale').canRetry).toBe(true);
  });

  it('keeps a confirmed snapshot stale on failure, distinguishes offline and first-load failure', () => {
    expect(failedRefreshState(true, false)).toBe('stale');
    expect(failedRefreshState(false, false)).toBe('failed');
    expect(failedRefreshState(true, true)).toBe('offline');
    expect(failedRefreshState(false, true)).toBe('offline');
  });

  it('does not start parallel requests or make offline requests', () => {
    expect(mayStartBalanceRefresh('refreshed', false, false)).toBe(true);
    expect(mayStartBalanceRefresh('stale', false, false)).toBe(true);
    expect(mayStartBalanceRefresh('loading', true, false)).toBe(false);
    expect(mayStartBalanceRefresh('refreshed', true, false)).toBe(false);
    expect(mayStartBalanceRefresh('offline', false, true)).toBe(false);
  });
});
