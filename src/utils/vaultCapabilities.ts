/**
 * Vault capability checks — determines which vault actions are currently
 * usable based on configuration, contract state, wallet state, and runtime
 * readiness.
 *
 * SDK capability assumptions are documented in
 * docs/vault-sdk-capability-assumptions.md.
 */

import type {
  VaultActionCapability,
  VaultCapabilities,
  VaultAction,
} from '../types/vault';

export interface VaultCapabilityInput {
  hasWallet: boolean;
  isContractConfigured: boolean;
  isFeatureEnabled: boolean;
  isSdkReady: boolean;
  isLoading: boolean;
  /** Marks enabled vault actions as preview/Testnet quality. */
  isExperimentalEnabled?: boolean;
  /** Runtime capability-check failure, for example a balance read error. */
  error?: string | null;
}

export const DEFAULT_CAPABILITY_INPUT: VaultCapabilityInput = {
  hasWallet: false,
  isContractConfigured: false,
  isFeatureEnabled: true,
  isSdkReady: true,
  isLoading: true,
  isExperimentalEnabled: false,
  error: null,
};

const unavailable = (
  reason: string,
  detail: string,
): VaultActionCapability => ({
  status: 'unavailable',
  reason,
  detail,
});

function evaluateActionCapability(
  input: VaultCapabilityInput,
  action: VaultAction,
): VaultActionCapability {
  if (input.isLoading) return { status: 'loading' };

  if (!input.isFeatureEnabled) {
    return unavailable(
      'Vault feature is disabled',
      'Vault actions are disabled by EXPO_PUBLIC_VAULT_ENABLED.',
    );
  }

  if (!input.hasWallet) {
    return unavailable(
      'No wallet available',
      'Create or import a wallet before using vault actions.',
    );
  }

  if (!input.isSdkReady) {
    return unavailable(
      'Vault backend not ready',
      'The vault SDK readiness signal is disabled. Try again when the backend integration is ready.',
    );
  }

  if (input.error) {
    return {
      status: 'error',
      reason: 'Vault capability check failed',
      detail: input.error,
    };
  }

  const isExperimental =
    input.isExperimentalEnabled === true || !input.isContractConfigured;

  if (isExperimental) {
    const detail = !input.isContractConfigured
      ? 'No live vault contract is configured. This action uses the local preview path and does not move real funds.'
      : 'This vault path is explicitly enabled as experimental and may change while SDK and contract integration stabilises.';

    return {
      status: 'experimental',
      reason: `${action[0].toUpperCase()}${action.slice(1)} is experimental`,
      detail,
    };
  }

  return { status: 'available' };
}

export function evaluateVaultCapabilities(
  input: VaultCapabilityInput,
): VaultCapabilities {
  return {
    deposit: evaluateActionCapability(input, 'deposit'),
    withdraw: evaluateActionCapability(input, 'withdraw'),
    lock: evaluateActionCapability(input, 'lock'),
    unlock: evaluateActionCapability(input, 'unlock'),
  };
}

/**
 * Compatibility helper for UI action gates.
 * Experimental actions remain intentionally usable.
 */
export function isActionSupported(
  capabilities: VaultCapabilities,
  action: VaultAction,
): boolean {
  const status = capabilities[action].status;
  return status === 'available' || status === 'experimental';
}

export function getActionUnsupportedReason(
  capabilities: VaultCapabilities,
  action: VaultAction,
): string | null {
  const capability = capabilities[action];
  return capability.status === 'unavailable' || capability.status === 'error'
    ? capability.reason
    : null;
}

export function getActionUnsupportedDetail(
  capabilities: VaultCapabilities,
  action: VaultAction,
): string | null {
  const capability = capabilities[action];
  return capability.status === 'unavailable' || capability.status === 'error'
    ? (capability.detail ?? null)
    : null;
}
