/**
 * Reactive vault capability state.
 *
 * Combines wallet state, contract configuration, feature flags, SDK readiness,
 * and runtime read errors into per-action readiness states.
 */

import { useMemo } from 'react';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { useWalletStore } from '../store/walletStore';
import { useVaultStore } from '../store/vaultStore';
import {
  evaluateVaultCapabilities,
  type VaultCapabilityInput,
} from '../utils/vaultCapabilities';
import type { VaultCapabilities } from '../types/vault';

const envEnabled = (
  value: string | undefined,
  defaultValue: boolean,
): boolean => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0';
};

export function useVaultCapabilities(): VaultCapabilities & {
  /** True while any capability check is still loading. */
  isLoading: boolean;
} {
  const publicKey = useWalletStore((state) => state.publicKey);
  const isConfigured = useVaultStore((state) => state.isConfigured);
  const isLoadingBalance = useVaultStore((state) => state.isLoadingBalance);
  const isLoadingLocks = useVaultStore((state) => state.isLoadingLocks);
  const balanceError = useVaultStore((state) => state.balanceError);

  return useMemo(() => {
    const input: VaultCapabilityInput = {
      hasWallet: publicKey !== null,
      isContractConfigured: isConfigured,
      isFeatureEnabled: envEnabled(
        process.env.EXPO_PUBLIC_VAULT_ENABLED,
        true,
      ),
      isSdkReady: envEnabled(
        process.env.EXPO_PUBLIC_VAULT_SDK_READY,
        true,
      ),
      isLoading: isLoadingBalance || isLoadingLocks,
      isExperimentalEnabled:
        FEATURE_FLAGS.ENABLE_VAULT_EXPERIMENTAL.enabled &&
        FEATURE_FLAGS.ENABLE_VAULT_EXPERIMENTAL.experimental,
      error: balanceError,
    };

    return {
      ...evaluateVaultCapabilities(input),
      isLoading: input.isLoading,
    };
  }, [
    publicKey,
    isConfigured,
    isLoadingBalance,
    isLoadingLocks,
    balanceError,
  ]);
}
