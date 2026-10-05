/**
 * Vault error compatibility layer.
 *
 * Vault callers keep the established VaultRecoveryGuidance API while mapping
 * through the shared SDK taxonomy used by payment, wallet, and transactions.
 */
import {
  describeSdkError,
  mapSdkError,
  type SdkErrorCategory,
} from './sdkErrorMapper';

export type VaultErrorCode =
  | 'validation'
  | 'unsupported-feature'
  | 'network'
  | 'signing-rejected'
  | 'contract-error'
  | 'secret-unavailable'
  | 'insufficient-balance'
  | 'reserve-not-met'
  | 'lock-not-found'
  | 'not-matured'
  | 'unknown';

export interface VaultRecoveryGuidance {
  title: string;
  message: string;
  action: string;
  canRetry: boolean;
  shouldNavigateBack: boolean;
  /** Stable support identifier containing no raw RPC/contract data. */
  diagnosticCode?: string;
}

const VAULT_CATEGORY_MAP: Record<VaultErrorCode, SdkErrorCategory> = {
  validation: 'validation',
  'unsupported-feature': 'unsupported',
  network: 'network',
  'signing-rejected': 'signing-rejected',
  'contract-error': 'contract',
  'secret-unavailable': 'wallet-storage',
  'insufficient-balance': 'insufficient-balance',
  'reserve-not-met': 'reserve-not-met',
  'lock-not-found': 'lock-not-found',
  'not-matured': 'not-matured',
  unknown: 'unknown',
};

function toVaultGuidance(
  mapped: ReturnType<typeof mapSdkError>
): VaultRecoveryGuidance {
  return {
    title: mapped.title,
    message: mapped.message,
    action: mapped.action,
    canRetry: mapped.canRetry,
    shouldNavigateBack: mapped.shouldNavigateBack,
    diagnosticCode: mapped.diagnosticCode,
  };
}

export function describeVaultError(code: VaultErrorCode): VaultRecoveryGuidance {
  return toVaultGuidance(
    describeSdkError('vault', VAULT_CATEGORY_MAP[code] ?? 'unknown')
  );
}

/**
 * Classify an unknown thrown value into user-safe vault recovery guidance.
 * The returned object intentionally excludes the raw exception message.
 */
export function classifyVaultError(error: unknown): VaultRecoveryGuidance {
  return toVaultGuidance(mapSdkError(error, 'vault'));
}
