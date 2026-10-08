export type VaultActionState =
  | 'idle'
  | 'review'
  | 'signing'
  | 'submission'
  | 'pending'
  | 'confirmed'
  | 'failed';

export interface VaultActionStatus {
  state: VaultActionState;
  error?: string;
  txHash?: string;
}

export const VAULT_ACTION_LABELS: Record<VaultActionState, string> = {
  idle: '',
  review: 'Review',
  signing: 'Signing…',
  submission: 'Submitting…',
  pending: 'Pending confirmation…',
  confirmed: 'Confirmed',
  failed: 'Failed',
};

/**
 * Readiness state for one vault action.
 *
 * "experimental" is intentionally usable: it identifies preview/Testnet paths
 * without conflating them with unavailable or failed capability checks.
 */
export type VaultActionCapability =
  | { status: 'available' }
  | { status: 'experimental'; reason: string; detail?: string }
  | { status: 'unavailable'; reason: string; detail?: string }
  | { status: 'loading' }
  | { status: 'error'; reason: string; detail?: string };

/**
 * Map of all vault actions to their capability state.
 */
export interface VaultCapabilities {
  deposit: VaultActionCapability;
  withdraw: VaultActionCapability;
  lock: VaultActionCapability;
  unlock: VaultActionCapability;
}

export type VaultAction = 'deposit' | 'withdraw' | 'lock' | 'unlock';


