/**
 * Payment error compatibility layer.
 *
 * Payment callers keep the existing RecoveryGuidance surface while the actual
 * taxonomy lives in sdkErrorMapper.ts with wallet, transaction, and vault.
 */
import { mapSdkError } from './sdkErrorMapper';

/**
 * Shown when submission throws but we can't tell whether the transaction
 * actually reached the ledger (e.g. a client-side timeout) — claiming
 * "Failed" here could be wrong, since Horizon may have accepted it anyway.
 */
export const UNCONFIRMED_SUBMISSION_MESSAGE =
  'Could not confirm submission. Check your transaction history before retrying.';

export interface RecoveryGuidance {
  /** Short, human-readable error title. */
  title: string;
  /** One-sentence explanation of what went wrong. */
  message: string;
  /** Suggested next action for the user. */
  action: string;
  /** Whether the user should try again with the same inputs. */
  canRetry: boolean;
  /** Whether the user should navigate back / fix inputs. */
  shouldNavigateBack: boolean;
  /** Stable support identifier containing no raw SDK error data. */
  diagnosticCode?: string;
}

/**
 * Classify a raw payment/Horizon error into user-safe recovery guidance.
 *
 * The shared mapper never returns raw SDK text. That prevents account keys,
 * endpoints, contract details, or arbitrary exception payloads from leaking
 * through the generic fallback.
 */
export const classifyPaymentError = (error: unknown): RecoveryGuidance => {
  const mapped = mapSdkError(error, 'payment');

  return {
    title: mapped.title,
    message: mapped.message,
    action: mapped.action,
    canRetry: mapped.canRetry,
    shouldNavigateBack: mapped.shouldNavigateBack,
    diagnosticCode: mapped.diagnosticCode,
  };
};
