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
