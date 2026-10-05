import { useMemo } from 'react';
import { useWalletStore } from '../store/walletStore';
import { useVaultStore } from '../store/vaultStore';
import { evaluateVaultAvailability, VaultAvailability } from '../utils/vaultAvailability';

/** Recompute the shared readiness model when any prerequisite changes. */
export function useVaultAvailability(): VaultAvailability {
  const publicKey = useWalletStore((s) => s.publicKey);
  const isConfigured = useVaultStore((s) => s.isConfigured);
  const vaultEnabledFlag = process.env.EXPO_PUBLIC_VAULT_ENABLED;

  return useMemo(
    () => evaluateVaultAvailability({ publicKey, isVaultConfigured: isConfigured, vaultEnabledFlag }),
    [publicKey, isConfigured, vaultEnabledFlag]
  );
}
