import { redactSensitiveString } from './redactSensitive';

export type SdkErrorDomain = 'payment' | 'wallet' | 'transaction' | 'vault';

export type SdkErrorSeverity = 'info' | 'warning' | 'error';

export type SdkRecoveryAction =
  | 'retry'
  | 'edit-input'
  | 'fund-wallet'
  | 'check-history'
  | 'refresh'
  | 'reimport-wallet'
  | 'open-settings'
  | 'contact-support'
  | 'none';

export type SdkErrorCategory =
  | 'network'
  | 'insufficient-balance'
  | 'reserve-not-met'
  | 'destination-not-found'
  | 'trustline-missing'
  | 'authentication'
  | 'fee-too-low'
  | 'sequence'
  | 'expired'
  | 'signing-rejected'
  | 'wallet-storage'
  | 'unsupported'
  | 'contract'
  | 'validation'
  | 'lock-not-found'
  | 'not-matured'
  | 'unknown';

export interface SdkErrorGuidance {
  domain: SdkErrorDomain;
  category: SdkErrorCategory;
  severity: SdkErrorSeverity;
  title: string;
  message: string;
  action: string;
  recoveryAction: SdkRecoveryAction;
  canRetry: boolean;
  shouldNavigateBack: boolean;
  /**
   * Stable, non-sensitive token suitable for support screenshots and logs.
   * It intentionally contains no raw SDK message, address, key, URL, or amount.
   */
  diagnosticCode: string;
}

type GuidanceTemplate = Omit<SdkErrorGuidance, 'domain' | 'diagnosticCode'>;

const TEMPLATES: Record<SdkErrorCategory, GuidanceTemplate> = {
  network: {
    category: 'network',
    severity: 'warning',
    title: 'Network Error',
    message: 'Could not reach the Stellar network.',
    action: 'Check your internet connection and try again.',
    recoveryAction: 'retry',
    canRetry: true,
    shouldNavigateBack: false,
  },
  'insufficient-balance': {
    category: 'insufficient-balance',
    severity: 'warning',
    title: 'Insufficient Balance',
    message: 'Your account does not have enough XLM to complete this action plus the network reserve.',
    action: 'Add funds to your wallet or reduce the amount, then try again.',
    recoveryAction: 'fund-wallet',
    canRetry: false,
    shouldNavigateBack: true,
  },
  'reserve-not-met': {
    category: 'reserve-not-met',
    severity: 'warning',
    title: 'Reserve Not Met',
    message: 'This action would drop your balance below the minimum network reserve.',
    action: 'Reduce the amount or add funds to your wallet.',
    recoveryAction: 'edit-input',
    canRetry: false,
    shouldNavigateBack: false,
  },
  'destination-not-found': {
    category: 'destination-not-found',
    severity: 'warning',
    title: 'Recipient Not Found',
    message: 'The destination account does not exist on the Stellar network yet.',
    action: 'Double-check the address. The recipient may need to fund their account first.',
    recoveryAction: 'edit-input',
    canRetry: false,
    shouldNavigateBack: false,
  },
  'trustline-missing': {
    category: 'trustline-missing',
    severity: 'warning',
    title: 'Trustline Missing',
    message: 'The recipient has not set up a trustline for this asset.',
    action: 'Ask the recipient to add the required trustline, then try again.',
    recoveryAction: 'edit-input',
    canRetry: false,
    shouldNavigateBack: true,
  },
  authentication: {
    category: 'authentication',
    severity: 'error',
    title: 'Authentication Error',
    message: 'The wallet could not authorize this action.',
    action: 'Reopen the app and try again. If this persists, re-import your wallet.',
    recoveryAction: 'reimport-wallet',
    canRetry: false,
    shouldNavigateBack: true,
  },
  'fee-too-low': {
    category: 'fee-too-low',
    severity: 'warning',
    title: 'Fee Too Low',
    message: 'The network fee included in the transaction was too low.',
    action: 'Try again so PocketPay can recalculate the current network fee.',
    recoveryAction: 'retry',
    canRetry: true,
    shouldNavigateBack: false,
  },
  sequence: {
    category: 'sequence',
    severity: 'warning',
    title: 'Sequence Error',
    message: 'Your account sequence number is out of sync with the network.',
    action: 'Refresh your wallet, wait a moment, and try again.',
    recoveryAction: 'refresh',
    canRetry: true,
    shouldNavigateBack: false,
  },
  expired: {
    category: 'expired',
    severity: 'warning',
    title: 'Transaction Expired',
    message: 'The transaction window closed before submission completed.',
    action: 'Review the payment details and submit a new transaction.',
    recoveryAction: 'retry',
    canRetry: true,
    shouldNavigateBack: false,
  },
  'signing-rejected': {
    category: 'signing-rejected',
    severity: 'info',
    title: 'Signing Cancelled',
    message: 'The transaction was not signed. Your funds are unchanged.',
    action: 'Try again when you are ready to approve the transaction.',
    recoveryAction: 'retry',
    canRetry: true,
    shouldNavigateBack: false,
  },
  'wallet-storage': {
    category: 'wallet-storage',
    severity: 'error',
    title: 'Wallet Access Error',
    message: 'PocketPay could not access the wallet securely on this device.',
    action: 'Unlock the device and retry. If the issue persists, restart PocketPay or re-import your wallet.',
    recoveryAction: 'reimport-wallet',
    canRetry: true,
    shouldNavigateBack: true,
  },
  unsupported: {
    category: 'unsupported',
    severity: 'warning',
    title: 'Feature Unavailable',
    message: 'This action is not supported in the current configuration.',
    action: 'Check Settings for the active network and capability state.',
    recoveryAction: 'open-settings',
    canRetry: false,
    shouldNavigateBack: false,
  },
  contract: {
    category: 'contract',
    severity: 'error',
    title: 'Contract Error',
    message: 'The Soroban contract rejected this action.',
    action: 'Refresh the vault and try again. If it persists, contact support with the diagnostic code.',
    recoveryAction: 'refresh',
    canRetry: true,
    shouldNavigateBack: false,
  },
  validation: {
    category: 'validation',
    severity: 'warning',
    title: 'Invalid Input',
    message: 'One or more values are not valid for this action.',
    action: 'Review the entered values and try again.',
    recoveryAction: 'edit-input',
    canRetry: false,
    shouldNavigateBack: true,
  },
  'lock-not-found': {
    category: 'lock-not-found',
    severity: 'warning',
    title: 'Lock Unavailable',
    message: 'This vault lock is no longer available. It may already have been withdrawn.',
    action: 'Refresh the vault to load the current locks.',
    recoveryAction: 'refresh',
    canRetry: false,
    shouldNavigateBack: false,
  },
  'not-matured': {
    category: 'not-matured',
    severity: 'info',
    title: 'Lock Not Ready',
    message: 'This lock has not matured yet.',
    action: 'Wait for the unlock date or review the lock details.',
    recoveryAction: 'none',
    canRetry: false,
    shouldNavigateBack: false,
  },
  unknown: {
    category: 'unknown',
    severity: 'error',
    title: 'Something Went Wrong',
    message: 'PocketPay could not complete this action safely.',
    action: 'Try again once. If the problem persists, contact support with the diagnostic code.',
    recoveryAction: 'contact-support',
    canRetry: true,
    shouldNavigateBack: false,
  },
};

function extractRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  if (error && typeof error === 'object') {
    const candidate = error as Record<string, any>;
    const resultCode =
      candidate.response?.data?.extras?.result_codes?.operation ||
      candidate.response?.data?.extras?.result_codes?.transaction;
    if (typeof resultCode === 'string') return resultCode;
    if (typeof candidate.code === 'string') return candidate.code;
    if (typeof candidate.message === 'string') return candidate.message;
  }

  return '';
}

/**
 * Converts SDK/service errors into one stable user-facing taxonomy.
 *
 * Classification may inspect the raw error in-memory, but the returned object
 * never contains the raw message. The redaction call below is therefore a
 * defense-in-depth guard against accidentally using sensitive text for future
 * classification additions.
 */
export function mapSdkError(
  error: unknown,
  domain: SdkErrorDomain
): SdkErrorGuidance {
  const rawMessage = redactSensitiveString(extractRawMessage(error));
  const lower = rawMessage.toLowerCase().trim();

  let category: SdkErrorCategory = 'unknown';

  if (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('unreachable')
  ) {
    category = 'network';
  } else if (
    lower.includes('user denied') ||
    lower.includes('user rejected') ||
    lower.includes('user_cancelled') ||
    lower.includes('canceled') ||
    lower.includes('cancelled') ||
    lower.includes('signing rejected')
  ) {
    category = 'signing-rejected';
  } else if (
    lower.includes('op_underfunded') ||
    lower.includes('insufficient funds') ||
    lower.includes('insufficient balance')
  ) {
    category = 'insufficient-balance';
  } else if (lower.includes('op_low_reserve') || lower.includes('low reserve')) {
    category = 'reserve-not-met';
  } else if (lower.includes('op_no_destination')) {
    category = 'destination-not-found';
  } else if (lower.includes('op_no_trust')) {
    category = 'trustline-missing';
  } else if (lower.includes('tx_insufficient_fee')) {
    category = 'fee-too-low';
  } else if (lower.includes('tx_bad_seq')) {
    category = 'sequence';
  } else if (lower.includes('tx_too_late')) {
    category = 'expired';
  } else if (
    lower.includes('secure store') ||
    lower.includes('secure storage') ||
    lower.includes('keychain') ||
    lower.includes('keystore') ||
    lower.includes('wallet secret') ||
    lower.includes('failed to persist wallet') ||
    lower.includes('failed to restore wallet') ||
    lower.includes('failed to read wallet') ||
    lower.includes('failed to clear wallet')
  ) {
    category = 'wallet-storage';
  } else if (
    lower.includes('tx_bad_auth') ||
    lower.includes('bad auth') ||
    lower.includes('authentication')
  ) {
    category = 'authentication';
  } else if (
    lower.includes('lock-not-found') ||
    lower.includes('lock not found')
  ) {
    category = 'lock-not-found';
  } else if (
    lower.includes('not-matured') ||
    lower.includes('not matured')
  ) {
    category = 'not-matured';
  } else if (
    lower.includes('unsupported') ||
    lower.includes('not supported') ||
    lower.includes('not implemented') ||
    lower.includes('not available')
  ) {
    category = 'unsupported';
  } else if (
    lower.includes('contract') ||
    lower.includes('soroban') ||
    lower.includes('simulation failed')
  ) {
    category = 'contract';
  } else if (
    lower.includes('invalid') ||
    lower.includes('validation') ||
    lower.includes('not a valid') ||
    lower.includes('must be')
  ) {
    category = 'validation';
  }

  const template =
    category === 'unknown' && domain === 'transaction'
      ? {
          ...TEMPLATES.unknown,
          severity: 'warning' as const,
          title: 'Transaction Status Unknown',
          message: 'PocketPay could not confirm the final transaction status.',
          action: 'Check transaction history before sending again.',
          recoveryAction: 'check-history' as const,
          canRetry: false,
        }
      : TEMPLATES[category];

  return {
    ...template,
    domain,
    diagnosticCode: `SDK-${domain.toUpperCase()}-${category
      .toUpperCase()
      .replace(/-/g, '_')}`,
  };
}

/** Build a mapping directly from a known canonical category. */
export function describeSdkError(
  domain: SdkErrorDomain,
  category: SdkErrorCategory
): SdkErrorGuidance {
  const template = TEMPLATES[category] ?? TEMPLATES.unknown;
  return {
    ...template,
    domain,
    diagnosticCode: `SDK-${domain.toUpperCase()}-${template.category
      .toUpperCase()
      .replace(/-/g, '_')}`,
  };
}
