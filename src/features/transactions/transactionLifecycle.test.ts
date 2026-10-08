import {
  canTransitionPayment,
  canCancelPayment,
  mayHaveSubmitted,
} from './transactionLifecycle';

describe('transaction lifecycle (#387)', () => {
  it('permits a single ordered review -> signing -> network settlement', () => {
    const path = ['idle', 'review', 'handoff', 'signing', 'submitting', 'confirming', 'completed'] as const;
    for (let i = 0; i + 1 < path.length; i += 1) {
      expect(canTransitionPayment(path[i], path[i + 1])).toBe(true);
    }
  });

  it('does not reopen review or allow cancellation after signing starts', () => {
    expect(canTransitionPayment('signing', 'review')).toBe(false);
    expect(canTransitionPayment('submitting', 'cancelled')).toBe(false);
    expect(canCancelPayment('signing')).toBe(false);
    expect(canCancelPayment('review')).toBe(true);
  });

  it('keeps ambiguous network outcomes out of automatic retry', () => {
    expect(canTransitionPayment('signing', 'unknown')).toBe(true);
    expect(canTransitionPayment('unknown', 'idle')).toBe(false);
    expect(canTransitionPayment('unknown', 'review')).toBe(false);
    expect(canTransitionPayment('unknown', 'completed')).toBe(true);
  });

  it('separates acknowledged-but-unconfirmed pending from completion', () => {
    expect(canTransitionPayment('submitting', 'pending')).toBe(true);
    expect(canTransitionPayment('pending', 'completed')).toBe(true);
    expect(canTransitionPayment('pending', 'cancelled')).toBe(false);
  });

  it('does not claim a preflight failure may already be submitted', () => {
    expect(mayHaveSubmitted('handoff')).toBe(false);
    expect(mayHaveSubmitted('signing')).toBe(true);
    expect(mayHaveSubmitted('submitting')).toBe(true);
    expect(mayHaveSubmitted('unknown')).toBe(true);
  });
});
