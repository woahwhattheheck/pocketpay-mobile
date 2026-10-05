/**
 * Shared readiness gates for the vault placeholder and action controls.
 * "ready" means configured for interaction, not verified on-chain.
 * See docs/vault-readiness.md for the current integration limitations.
 */
export type VaultReadinessState = 'unavailable' | 'planned' | 'disabled' | 'ready';

export type VaultUnavailableReason =
  | 'no-wallet'
  | 'feature-disabled'
  | 'sdk-not-ready'
  | 'contract-not-configured';

export interface VaultAvailability {
  state: VaultReadinessState;
  /** True only when the configuration, wallet and SDK gates are satisfied. */
  isAvailable: boolean;
  reasons: VaultUnavailableReason[];
  /** Configuration presence does not prove deployment or connectivity. */
  isContractConfigured: boolean;
}

export interface VaultReadinessInput {
  hasWallet: boolean;
  isContractConfigured: boolean;
  isFeatureEnabled: boolean;
  /** Compatibility default until the SDK exposes a readiness signal. */
  isSdkReady?: boolean;
}

export interface VaultAvailabilityInput {
  publicKey: string | null;
  isVaultConfigured: boolean;
  vaultEnabledFlag?: string;
  isSdkReady?: boolean;
}

/** Match the existing environment flag semantics in every vault gate. */
export function isVaultFeatureEnabled(flag?: string): boolean {
  const value = (flag ?? 'true').trim().toLowerCase();
  return value !== 'false' && value !== '0';
}

/** Explicit disablement takes precedence; preserve every blocking reason. */
export function getVaultReadinessState(
  reasons: readonly VaultUnavailableReason[]
): VaultReadinessState {
  if (reasons.includes('feature-disabled')) return 'disabled';
  if (reasons.includes('no-wallet') || reasons.includes('sdk-not-ready')) return 'unavailable';
  if (reasons.includes('contract-not-configured')) return 'planned';
  return 'ready';
}

export function evaluateVaultReadiness(input: VaultReadinessInput): VaultAvailability {
  const reasons: VaultUnavailableReason[] = [];
  if (!input.isFeatureEnabled) reasons.push('feature-disabled');
  if (!input.hasWallet) reasons.push('no-wallet');
  if (input.isSdkReady === false) reasons.push('sdk-not-ready');
  if (!input.isContractConfigured) reasons.push('contract-not-configured');

  const state = getVaultReadinessState(reasons);
  return {
    state,
    isAvailable: state === 'ready',
    reasons,
    isContractConfigured: input.isContractConfigured,
  };
}

/** Retain the wallet/configuration adapter used by useVaultAvailability. */
export function evaluateVaultAvailability(input: VaultAvailabilityInput): VaultAvailability {
  return evaluateVaultReadiness({
    hasWallet: Boolean(input.publicKey),
    isContractConfigured: input.isVaultConfigured,
    isFeatureEnabled: isVaultFeatureEnabled(input.vaultEnabledFlag),
    isSdkReady: input.isSdkReady,
  });
}

export interface UnavailableReasonCopy {
  title: string;
  message: string;
  hint?: string;
}

export function describeVaultReadiness(state: VaultReadinessState): UnavailableReasonCopy {
  switch (state) {
    case 'disabled':
      return {
        title: 'Vault Disabled',
        message: 'Vault actions are turned off for this build. Retrying does not change the configuration.',
      };
    case 'planned':
      return {
        title: 'Vault Planned',
        message: 'This vault is a placeholder until a contract is configured. Deposits, withdrawals and time-lock actions are unavailable.',
      };
    case 'unavailable':
      return {
        title: 'Vault Unavailable',
        message: 'The vault cannot be used right now. Resolve the requirements below before trying again.',
      };
    case 'ready':
      return {
        title: 'Vault Configured',
        message: 'The wallet and configuration gates are satisfied. This status does not verify contract deployment, network connectivity or transaction success.',
      };
  }
}

export function describeUnavailableReason(reason: VaultUnavailableReason): UnavailableReasonCopy {
  switch (reason) {
    case 'no-wallet':
      return {
        title: 'No wallet connected',
        message: 'Create or import a wallet to use the Soroban Savings Vault.',
        hint: 'Go to Settings → Create Wallet or Import Wallet.',
      };
    case 'feature-disabled':
      return {
        title: 'Vault feature disabled',
        message: 'The vault is disabled by this build’s configuration.',
        hint: 'EXPO_PUBLIC_VAULT_ENABLED is set to false or 0. A configuration change and rebuild are required.',
      };
    case 'sdk-not-ready':
      return {
        title: 'Vault backend not ready',
        message: 'The vault SDK reports that the backend is not ready. Vault actions remain unavailable.',
        hint: 'See docs/vault-sdk-capability-assumptions.md for details.',
      };
    case 'contract-not-configured':
      return {
        title: 'Vault contract not configured',
        message: 'No vault contract is configured. Placeholder balances are not deposited funds, and no vault actions can be submitted here.',
        hint: 'Configure EXPO_PUBLIC_VAULT_CONTRACT_ID for the intended network and rebuild the app.',
      };
  }
}
