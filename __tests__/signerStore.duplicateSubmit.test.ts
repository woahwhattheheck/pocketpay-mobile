import { useSignerStore } from '../src/store/signerStore';
import type { TransactionReview } from '../src/types/signer';

const review: TransactionReview = {
  requestId: 'tx-double-tap',
  sourcePublicKey: 'GSOURCE',
  destinationPublicKey: 'GDEST',
  amount: '10',
  assetCode: 'XLM',
  network: 'Testnet',
  createdAt: '2026-10-05T00:00:00.000Z',
  timeoutSeconds: 30,
};

describe('signerStore duplicate-submit guard', () => {
  beforeEach(() => {
    useSignerStore.getState().reset();
  });

  it('does not reopen an in-flight request on route remount', () => {
    const other: TransactionReview = {
      ...review,
      requestId: 'tx-new-route',
      destinationPublicKey: 'GOTHER',
    };
    useSignerStore.getState().startReview(review);
    expect(useSignerStore.getState().beginSigningAttempt(review.requestId)).toBe(true);

    // A second route's initialization cannot bypass the in-flight submit lock.
    useSignerStore.getState().startReview(other);
    expect(useSignerStore.getState().phase).toBe('handoff');
    expect(useSignerStore.getState().currentReview).toEqual(review);
    expect(useSignerStore.getState().beginSigningAttempt(other.requestId)).toBe(false);

    useSignerStore.getState().enterSubmitting();
    useSignerStore.getState().startReview(other);
    expect(useSignerStore.getState().phase).toBe('submitting');
    expect(useSignerStore.getState().currentReview?.requestId).toBe(review.requestId);

    // Reset permits legitimate later transactions but not a stale handler.
    useSignerStore.getState().reset();
    useSignerStore.getState().startReview(other);
    expect(useSignerStore.getState().beginSigningAttempt(review.requestId)).toBe(false);
    expect(useSignerStore.getState().beginSigningAttempt(other.requestId)).toBe(true);
  });

  it('allows exactly one signing attempt and preserves the review while adding the fee', () => {
    useSignerStore.getState().startReview(review);

    expect(useSignerStore.getState().beginSigningAttempt()).toBe(true);
    expect(useSignerStore.getState().beginSigningAttempt()).toBe(false);
    expect(useSignerStore.getState().phase).toBe('handoff');

    useSignerStore.getState().setReviewFee('100');

    expect(useSignerStore.getState().phase).toBe('handoff');
    expect(useSignerStore.getState().currentReview).toEqual({
      ...review,
      fee: '100',
    });
  });
});
