import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useAppStore } from '../store/appStore';
import { useWalletStore } from '../store/walletStore';
import { getLastErrorReport } from './errorReporting';
import { computeNetworkEnvironment } from '../features/settings/useNetworkEnvironment';
import { FEATURE_FLAGS } from '../config/featureFlags';

/**
 * Storage status is read via SecureStore.isAvailableAsync() (a real device
 * capability check — Keychain/Keystore access, not a read of any stored
 * value), which is why this function is async unlike the rest of the
 * diagnostics builder.
 */
async function getStorageStatus(): Promise<{ secureStoreAvailable: boolean }> {
  try {
    const secureStoreAvailable = await SecureStore.isAvailableAsync();
    return { secureStoreAvailable };
  } catch {
    // isAvailableAsync itself should not throw, but if the platform shim is
    // missing (e.g. an unsupported test environment), report unavailable
    // rather than letting diagnostics export fail entirely.
    return { secureStoreAvailable: false };
  }
}

/** Enabled/disabled state per flag key. No description text — flag names and
 * booleans are enough to tell support which build variant a user is on, and
 * keeps the payload from growing with every new flag's documentation. */
function getFeatureFlagsSnapshot(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(FEATURE_FLAGS).map(([key, flag]) => [key, flag.enabled])
  );
}

/** A coarse support category; raw network errors stay in the redacted field. */
function classifyNetworkError(error: string | null | undefined): string | null {
  if (!error) return null;
  const message = error.toLowerCase();
  if (/timeout|timed out/.test(message)) return 'timeout';
  if (/rate.limit|too many requests|\b429\b/.test(message)) return 'rate_limit';
  if (/unauthorized|forbidden|permission|\b401\b|\b403\b/.test(message)) return 'authorization';
  if (/network|connection|offline|fetch|socket|dns|unreachable/.test(message)) return 'connection';
  return 'other';
}

// Error messages and caller-supplied source/name strings can contain arbitrary
// credentials, URLs, and personal data that format-based redaction cannot
// reliably recognize. Keep only known-safe labels in exported reports.
const SAFE_ERROR_NAMES = new Set([
  'Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError',
  'URIError', 'EvalError', 'AggregateError',
]);
const SAFE_ERROR_SOURCES = new Set([
  'ErrorBoundary', 'GlobalJsHandler', 'GlobalHandler', 'UnhandledPromiseRejection',
]);

export const getDiagnostics = async () => {
  const appState = useAppStore.getState();
  const walletState = useWalletStore.getState();
  const lastError = getLastErrorReport();
  const network = computeNetworkEnvironment();
  const storage = await getStorageStatus();

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
      // A custom network name comes verbatim from build configuration for
      // display in Settings. It is untrusted free text, so export only its
      // category rather than copying arbitrary credentials or user data into
      // a report that someone may share with support.
      label: network.networkTier === 'custom' ? 'Custom Network' : network.networkLabel,
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
      // Balance readiness is a fetch lifecycle, not whether the amount is
      // nonzero: zero-fund accounts can be fully loaded, while a previously
      // nonzero amount can remain cached after a failed refresh.
      isBalanceLoaded: walletState.balanceState === 'available',
      balanceState: walletState.balanceState,
      fundingStatus: walletState.fundingStatus,
      transactionsCount: walletState.transactions.length,
      isLoading: walletState.isLoading,
      lastRefreshed: walletState.lastRefreshed,
      lastError: walletState.error ? 'Details omitted for privacy' : null,
    },
    networkHealth: {
      classifiedError: networkErrorType,
      hasError: !!walletState.error,
    },
    /**
     * Most recent failure captured by reportError. Even messages redacted
     * for known key formats may contain unknown bearer tokens, query-string
     * credentials or user details. Export categories, never raw messages.
     */
    lastReportedError: lastError
      ? {
          source: SAFE_ERROR_SOURCES.has(lastError.source) ? lastError.source : 'Other',
          name: SAFE_ERROR_NAMES.has(lastError.name) ? lastError.name : 'Error',
          message: 'Details omitted for privacy',
          isFatal: Boolean(lastError.isFatal),
          timestamp: lastError.timestamp,
        }
      : null,
    timestamp: new Date().toISOString(),
  };

  return JSON.stringify(redactedDiagnostics, null, 2);
};
