import { useSignerStore } from '../src/store/signerStore';
import type { TransactionReview } from '../src/types/signer';
const review: TransactionReview = {
  requestId: 'attempt-a', sourcePublicKey: 'GSOURCE', destinationPublicKey: 'GDEST',
  amount: '1', assetCode: 'XLM', network: 'Testnet', createdAt: '2026-10-05T00:00:00Z', timeoutSeconds: 30,
};
beforeEach(() => {
  useSignerStore.setState({ activeSubmission: null, unknownSubmission: null });
  useSignerStore.getState().reset();
  useSignerStore.getState().startReview(review);
});

it('claims an attempt globally and prevents a second claim, reset, cancellation or new review', () => {
  const store = useSignerStore.getState();
  expect(store.beginSubmission()).toEqual(review);
  expect(store.beginSubmission()).toBeNull();
  store.reset();
  store.cancelSigning();
  store.startReview({ ...review, requestId: 'attempt-b', amount: '50' });
  expect(useSignerStore.getState().phase).toBe('handoff');
  expect(useSignerStore.getState().currentReview).toEqual(review);
});

it('binds unknown status to the captured attempt and blocks a new review', () => {
  const store = useSignerStore.getState();
  store.beginSubmission();
  store.recordUnknownSubmission('a'.repeat(64), review);
  store.reset();
  store.cancelSigning();
  store.startReview({ ...review, requestId: 'attempt-b' });
  expect(store.beginSubmission()).toBeNull();
  expect(useSignerStore.getState().unknownSubmission).toEqual({ transactionHash: 'a'.repeat(64), review });
});

it('only clears the exact resolved context, preserving a newer uncertainty', () => {
  const store = useSignerStore.getState();
  store.recordUnknownSubmission('a'.repeat(64), review);
  const original = useSignerStore.getState().unknownSubmission!;
  store.recordUnknownSubmission('b'.repeat(64), { ...review, requestId: 'attempt-b' });
  store.clearResolvedSubmission(original);
  const current = useSignerStore.getState().unknownSubmission!;
  expect(current.transactionHash).toBe('b'.repeat(64));
  store.clearResolvedSubmission(current);
  expect(useSignerStore.getState().phase).toBe('idle');
  expect(useSignerStore.getState().unknownSubmission).toBeNull();
});
