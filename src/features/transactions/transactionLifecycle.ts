import type { HandoffPhase } from '../../types/signer';

/**
 * Allowed lifecycle edges for a single payment request. There is intentionally
 * no path from submitting/pending/unknown back to review or cancellation:
 * a timeout after submission is NOT proof that the network rejected it.
 */
const edges: Readonly<Record<HandoffPhase, readonly HandoffPhase[]>> = {
  idle: ['validating', 'review'],
  validating: ['review', 'failed', 'cancelled'],
  review: ['handoff', 'failed', 'cancelled'],
  handoff: ['signing', 'failed', 'cancelled'],
  signing: ['submitting', 'failed', 'unknown'],
  submitting: ['confirming', 'pending', 'failed', 'unknown'],
  confirming: ['completed', 'pending', 'failed', 'unknown'],
  pending: ['completed', 'failed', 'unknown'],
  unknown: ['pending', 'completed', 'failed'],
  completed: ['idle'],
  failed: ['idle'],
  cancelled: ['idle'],
};

export function canTransitionPayment(from: HandoffPhase, to: HandoffPhase): boolean {
  return edges[from].includes(to);
}

/** Cancellation is safe only before signing/submission can have started. */
export function canCancelPayment(phase: HandoffPhase): boolean {
  return phase === 'validating' || phase === 'review' || phase === 'handoff';
}

/** A rejected/timeout promise after signing starts may already have been submitted. */
export function mayHaveSubmitted(phase: HandoffPhase): boolean {
  return phase === 'signing' || phase === 'submitting' || phase === 'confirming' || phase === 'pending' || phase === 'unknown';
}

export const UNKNOWN_PAYMENT_STATUS_MESSAGE =
  'The network outcome could not be confirmed. Check transaction history before attempting this payment again.';
