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
 * Readiness state for an individual vault action.
 *
 * `experimental` is intentionally actionable: it means the local/testnet
 * implementation is enabled but a live vault contract is not configured.
 * `unavailable` and `error` are non-actionable, while `loading` is a
 * transient state.
 */
export type VaultCapabilityStatus =
  | 'available'
  | 'experimental'
  | 'unavailable'
  | 'loading'
  | 'error';

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


