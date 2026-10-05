import { useMemo } from 'react';
import { useWalletStore } from '../store/walletStore';
import { useVaultStore } from '../store/vaultStore';
import { evaluateVaultCapabilities } from '../utils/vaultCapabilities';
import { isVaultFeatureEnabled } from '../utils/vaultAvailability';
import type { VaultCapabilities } from '../types/vault';

/** Reactive per-action gates using the same configuration as the placeholder. */
export function useVaultCapabilities(): VaultCapabilities & { isLoading: boolean } {
  const publicKey = useWalletStore((s) => s.publicKey);
  const isConfigured = useVaultStore((s) => s.isConfigured);
  const isLoadingBalance = useVaultStore((s) => s.isLoadingBalance);
  const isLoadingLocks = useVaultStore((s) => s.isLoadingLocks);
  const isFeatureEnabled = isVaultFeatureEnabled(process.env.EXPO_PUBLIC_VAULT_ENABLED);

  return useMemo(() => {
    const isLoading = isLoadingBalance || isLoadingLocks;
    return {
      ...evaluateVaultCapabilities({
        hasWallet: Boolean(publicKey),
        isContractConfigured: isConfigured,
        isFeatureEnabled,
        // No SDK readiness API is available yet; retain the documented default.
        isSdkReady: true,
        isLoading,
      }),
      isLoading,
    };
  }, [publicKey, isConfigured, isFeatureEnabled, isLoadingBalance, isLoadingLocks]);
}
