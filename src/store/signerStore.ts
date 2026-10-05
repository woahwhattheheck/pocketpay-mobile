import { create } from 'zustand';
import type {
  SignerType,
  SignerInfo,
  HandoffPhase,
  TransactionReview,
  SignerError,
  SigningResult,
} from '../types/signer';

interface SignerState {
  /** The active signer type for this session */
  activeSignerType: SignerType;
  /** Available signers discovered in the app */
  availableSigners: SignerInfo[];
  /** Current phase of the signing handoff */
  phase: HandoffPhase;
  /** Transaction pending review / signing */
  currentReview: TransactionReview | null;
  /** Last signing result, if any */
  lastResult: SigningResult | null;
  /** Current or last error */
  error: SignerError | null;
  /** Public metadata only; never retain the signed envelope or secret key. */
  unknownSubmission: { transactionHash?: string; review: TransactionReview } | null;
  /** A global attempt survives navigation while the network call is unresolved. */
  activeSubmission: TransactionReview | null;

  // Actions
  setActiveSignerType: (type: SignerType) => void;
  setAvailableSigners: (signers: SignerInfo[]) => void;
  startReview: (review: TransactionReview) => void;
  enterHandoff: () => void;
  enterSigning: () => void;
  enterSubmitting: () => void;
  enterConfirming: () => void;
  completeSigning: (result: SigningResult) => void;
  failSigning: (error: SignerError) => void;
  beginSubmission: () => TransactionReview | null;
  updateActiveSubmission: (review: TransactionReview) => void;
  recordUnknownSubmission: (transactionHash: string | undefined, review: TransactionReview) => void;
  clearResolvedSubmission: (submission: NonNullable<SignerState['unknownSubmission']>) => void;
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
  unknownSubmission: null as SignerState['unknownSubmission'],
  activeSubmission: null as TransactionReview | null,
};

export const useSignerStore = create<SignerState>((set, get) => ({
  ...initialState,

  setActiveSignerType: (type) => set({ activeSignerType: type }),

  setAvailableSigners: (signers) => set({ availableSigners: signers }),

  startReview: (review) => {
    if (get().activeSubmission || get().unknownSubmission) return;
    set({
      phase: 'review',
      currentReview: review,
      error: null,
      lastResult: null,
    });
  },

  beginSubmission: () => {
    const state = get();
    if (state.activeSubmission || state.unknownSubmission || state.phase !== 'review' || !state.currentReview) return null;
    set({ activeSubmission: state.currentReview, phase: 'handoff' });
    return state.currentReview;
  },

  updateActiveSubmission: (review) => {
    if (get().activeSubmission?.requestId !== review.requestId) return;
    set({ activeSubmission: review, currentReview: review });
  },

  enterHandoff: () => set({ phase: 'handoff' }),

  enterSigning: () => set({ phase: 'signing' }),

  enterSubmitting: () => set({ phase: 'submitting' }),

  enterConfirming: () => set({ phase: 'confirming' }),

  completeSigning: (result) =>
    set({
      phase: 'completed',
      lastResult: result,
      error: null,
      activeSubmission: null,
    }),

  failSigning: (error) =>
    set({
      phase: 'failed',
      error,
      activeSubmission: null,
    }),

  recordUnknownSubmission: (transactionHash, review) => {
    set({ phase: 'unknown', error: null, activeSubmission: null, currentReview: review, unknownSubmission: { transactionHash, review } });
  },

  clearResolvedSubmission: (submission) => {
    if (get().unknownSubmission !== submission || get().activeSubmission) return;
    set({ ...initialState });
  },

  cancelSigning: () => {
    if (get().activeSubmission || get().unknownSubmission) return;
    set({
      phase: 'cancelled',
      currentReview: null,
      lastResult: null,
      error: null,
    });
  },

  reset: () => {
    if (get().activeSubmission || get().unknownSubmission) return;
    set({ ...initialState });
  },
}));
