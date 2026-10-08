import { create } from 'zustand';
import type {
  SignerType,
  SignerInfo,
  HandoffPhase,
  TransactionReview,
  SignerError,
  SigningResult,
} from '../types/signer';
import {
  canCancelPayment,
  canTransitionPayment,
  UNKNOWN_PAYMENT_STATUS_MESSAGE,
} from '../features/transactions/transactionLifecycle';

interface SignerState {
  activeSignerType: SignerType;
  availableSigners: SignerInfo[];
  phase: HandoffPhase;
  currentReview: TransactionReview | null;
  lastResult: SigningResult | null;
  error: SignerError | null;

  setActiveSignerType: (type: SignerType) => void;
  setAvailableSigners: (signers: SignerInfo[]) => void;
  startReview: (review: TransactionReview) => void;
  setReviewFee: (fee: string) => void;
  enterHandoff: () => void;
  enterSigning: () => void;
  enterSubmitting: () => void;
  enterConfirming: () => void;
  markPending: () => void;
  markUnknown: () => void;
  completeSigning: (result: SigningResult) => void;
  failSigning: (error: SignerError) => void;
  cancelSigning: () => void;
  reset: () => void;
}

const initialState = {
  activeSignerType: 'local' as SignerType,
  availableSigners: [] as SignerInfo[],
  phase: 'idle' as HandoffPhase,
  currentReview: null as TransactionReview | null,
  lastResult: null as SigningResult | null,
  error: null as SignerError | null,
};

export const useSignerStore = create<SignerState>((set) => ({
  ...initialState,

  setActiveSignerType: (type) => set({ activeSignerType: type }),
  setAvailableSigners: (signers) => set({ availableSigners: signers }),

  // A new review can only acquire an idle session. A second tap or a second
  // screen mount must never reset a signing/submitting request to review.
  startReview: (review) =>
    set((state) =>
      canTransitionPayment(state.phase, 'review')
        ? { phase: 'review', currentReview: review, error: null, lastResult: null }
        : state,
    ),

  // Preserve request identity and the active phase while updating the quote.
  setReviewFee: (fee) =>
    set((state) =>
      state.phase === 'handoff' && state.currentReview
        ? { currentReview: { ...state.currentReview, fee } }
        : state,
    ),

  enterHandoff: () =>
    set((state) =>
      canTransitionPayment(state.phase, 'handoff') ? { phase: 'handoff' } : state,
    ),

  enterSigning: () =>
    set((state) =>
      canTransitionPayment(state.phase, 'signing') ? { phase: 'signing' } : state,
    ),

  enterSubmitting: () =>
    set((state) =>
      canTransitionPayment(state.phase, 'submitting') ? { phase: 'submitting' } : state,
    ),

  enterConfirming: () =>
    set((state) =>
      canTransitionPayment(state.phase, 'confirming') ? { phase: 'confirming' } : state,
    ),

  markPending: () =>
    set((state) =>
      canTransitionPayment(state.phase, 'pending')
        ? { phase: 'pending', error: null }
        : state,
    ),

  // Do not convert an ambiguous submission timeout into an explicit failure,
  // cancellation, or a retryable idle session.
  markUnknown: () =>
    set((state) =>
      canTransitionPayment(state.phase, 'unknown')
        ? {
            phase: 'unknown',
            error: { type: 'unknown', message: UNKNOWN_PAYMENT_STATUS_MESSAGE },
          }
        : state,
    ),

  completeSigning: (result) =>
    set((state) =>
      canTransitionPayment(state.phase, 'completed') &&
      state.currentReview?.requestId === result.review.requestId
        ? { phase: 'completed', lastResult: result, error: null }
        : state,
    ),

  failSigning: (error) =>
    set((state) =>
      canTransitionPayment(state.phase, 'failed')
        ? { phase: 'failed', error: { type: error.type, message: error.message } }
        : state,
    ),

  cancelSigning: () =>
    set((state) =>
      canCancelPayment(state.phase)
        ? { phase: 'cancelled', currentReview: null, lastResult: null, error: null }
        : state,
    ),

  // An unknown or pending transaction cannot be silently reset and replayed.
  // It must first receive an authoritative network resolution.
  reset: () =>
    set((state) =>
      state.phase === 'idle' || canTransitionPayment(state.phase, 'idle')
        ? { ...initialState }
        : state,
    ),
}));
