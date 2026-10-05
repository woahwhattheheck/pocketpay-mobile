/**
 * Per-action capability gates share the placeholder readiness model.
 * Configured actions still depend on network state and their service adapters;
 * this is not proof of on-chain capability or transaction success.
 */
import type { VaultActionCapability, VaultCapabilities, VaultAction } from '../types/vault';
import {
  evaluateVaultReadiness,
  describeUnavailableReason,
  VaultReadinessInput,
} from './vaultAvailability';

export interface VaultCapabilityInput extends VaultReadinessInput {
  isSdkReady: boolean;
  isLoading: boolean;
}

export const DEFAULT_CAPABILITY_INPUT: VaultCapabilityInput = {
  hasWallet: false,
  isContractConfigured: false,
  isFeatureEnabled: true,
  isSdkReady: true,
  isLoading: true,
};

export function evaluateVaultCapabilities(input: VaultCapabilityInput): VaultCapabilities {
  const readiness = evaluateVaultReadiness(input);
  let capability: VaultActionCapability;
  if (!readiness.isAvailable) {
    const copy = describeUnavailableReason(readiness.reasons[0]);
    capability = { status: 'unsupported', reason: copy.title, detail: copy.message };
  } else {
    capability = { status: input.isLoading ? 'loading' : 'supported' };
  }

  // Independent objects prevent one action's consumer from mutating its peers.
  return {
    deposit: { ...capability },
    withdraw: { ...capability },
    lock: { ...capability },
    unlock: { ...capability },
  };
}

export function isActionSupported(capabilities: VaultCapabilities, action: VaultAction): boolean {
  return capabilities[action].status === 'supported';
}

export function getActionUnsupportedReason(capabilities: VaultCapabilities, action: VaultAction): string | null {
  const cap = capabilities[action];
  return cap.status === 'unsupported' ? cap.reason : null;
}

export function getActionUnsupportedDetail(capabilities: VaultCapabilities, action: VaultAction): string | null {
  const cap = capabilities[action];
  return cap.status === 'unsupported' ? (cap.detail ?? null) : null;
}
