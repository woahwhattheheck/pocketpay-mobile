import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useAppStore } from '../store/appStore';
import { useWalletStore } from '../store/walletStore';
import { getLastErrorReport } from './errorReporting';
import { redactSensitiveString } from './redactSensitive';
import { computeNetworkEnvironment } from '../features/settings/useNetworkEnvironment';
import { FEATURE_FLAGS } from '../config/featureFlags';

export type SecureStorageDiagnosticCode =
  | 'available'
  | 'unavailable'
  | 'availability_check_failed'
  | 'write_failed'
  | 'read_failed'
  | 'delete_failed';

export interface SecureStorageDiagnostics {
  secureStoreAvailable: boolean;
  secureStoreOperational: boolean;
  secureStoreStatus: SecureStorageDiagnosticCode;
}

const SECURE_STORE_PROBE_KEY = '__pocketpay_secure_store_diagnostic__';
const SECURE_STORE_PROBE_VALUE = 'pocketpay-diagnostic';

/**
 * Probe SecureStore without reading wallet material.
 *
 * The probe is deliberately argument-free so callers cannot pass wallet data.
 * It uses one fixed non-sensitive value and returns only a coarse stage code,
 * never a raw Keychain or Keystore error.
 */
export async function probeSecureStorage(): Promise<SecureStorageDiagnostics> {
  let available = false;
  try {
    available = await SecureStore.isAvailableAsync();
  } catch {
    return {
      secureStoreAvailable: false,
      secureStoreOperational: false,
      secureStoreStatus: 'availability_check_failed',
    };
  }

  if (!available) {
    return {
      secureStoreAvailable: false,
      secureStoreOperational: false,
      secureStoreStatus: 'unavailable',
    };
  }

  try {
    await SecureStore.setItemAsync(SECURE_STORE_PROBE_KEY, SECURE_STORE_PROBE_VALUE);
  } catch {
    return {
      secureStoreAvailable: true,
      secureStoreOperational: false,
      secureStoreStatus: 'write_failed',
    };
  }

  let readMatches = false;
  try {
    readMatches =
      (await SecureStore.getItemAsync(SECURE_STORE_PROBE_KEY)) === SECURE_STORE_PROBE_VALUE;
  } catch {
    // Cleanup still runs below. Raw platform errors are not exported.
  }

  let cleanupSucceeded = true;
  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_PROBE_KEY);
  } catch {
    cleanupSucceeded = false;
  }

  if (!readMatches) {
    return {
      secureStoreAvailable: true,
      secureStoreOperational: false,
      secureStoreStatus: 'read_failed',
    };
  }

  if (!cleanupSucceeded) {
    return {
      secureStoreAvailable: true,
      secureStoreOperational: false,
      secureStoreStatus: 'delete_failed',
    };
  }

  return {
    secureStoreAvailable: true,
    secureStoreOperational: true,
    secureStoreStatus: 'available',
  };
}

/** Enabled/disabled state per flag key. No description text — flag names and
 * booleans are enough to tell support which build variant a user is on, and
 * keeps the payload from growing with every new flag's documentation. */
function getFeatureFlagsSnapshot(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(FEATURE_FLAGS).map(([key, flag]) => [key, flag.enabled])
  );
}

export const getDiagnostics = async () => {
  const appState = useAppStore.getState();
  const walletState = useWalletStore.getState();
  const lastError = getLastErrorReport();
  const network = computeNetworkEnvironment();
  const storage = await probeSecureStorage();

  // Derive network health from the wallet store error string.
  const networkErrorType = classifyNetworkError(walletState.error);

  // Redact sensitive data — never include secret keys, public keys, or balances.
  const redactedDiagnostics = {
    environment: {
      platform: Platform.OS,
      osVersion: Platform.Version,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      isDevelopment: __DEV__,
    },
    /**
     * Network/vault environment, reusing the same classification the
     * Settings screen shows (src/features/settings/useNetworkEnvironment) so
     * this can never drift from what the user sees on-device. Only
     * hostnames and a masked contract ID — never full RPC URLs or the raw
     * contract ID.
     */
    network: {
      tier: network.networkTier,
      label: network.networkLabel,
      horizonHost: network.horizonHost,
      sorobanHost: network.sorobanHost,
      vaultMode: network.vaultMode,
      vaultContractLabel: network.vaultContractLabel,
    },
    featureFlags: getFeatureFlagsSnapshot(),
    storage,
    appState: {
      isInitialized: appState.isInitialized,
      themeMode: appState.themeMode,
      contactsCount: appState.contacts.length,
    },
    walletState: {
      hasPublicKey: !!walletState.publicKey,
      isBalanceLoaded: walletState.balance !== '0.0000000',
      balanceState: walletState.balanceState,
      fundingStatus: walletState.fundingStatus,
      transactionsCount: walletState.transactions.length,
      isLoading: walletState.isLoading,
      lastRefreshed: walletState.lastRefreshed,
      lastError: walletState.error
        ? redactSensitiveString(walletState.error)
        : null,
    },
    networkHealth: {
      classifiedError: networkErrorType,
      hasError: !!walletState.error,
    },
    /**
     * Most recent failure captured by reportError (ErrorBoundary / global
     * handlers). Messages are already redacted at the reporting boundary.
     */
    lastReportedError: lastError
      ? {
          source: lastError.source,
          name: lastError.name,
          message: lastError.message,
          isFatal: Boolean(lastError.isFatal),
          timestamp: lastError.timestamp,
        }
      : null,
    timestamp: new Date().toISOString(),
  };

  return JSON.stringify(redactedDiagnostics, null, 2);
};
