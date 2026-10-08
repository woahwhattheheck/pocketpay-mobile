import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasHardwareAsync,
  isEnrolledAsync,
  authenticateAsync,
  AuthenticationType,
  SecurityLevel,
} from 'expo-local-authentication';

const LOCK_ENABLED_KEY = '@pocketpay_app_lock';
const LAST_AUTH_KEY = '@pocketpay_last_auth';

interface AppLockState {
  /** True only after the persisted lock setting has been read safely. */
  isInitialized: boolean;
  /** Whether the user has enabled app lock in settings */
  isLockEnabled: boolean;
  /** Whether the current session has been authenticated */
  isAuthenticated: boolean;
  /** Whether we're currently checking biometrics */
  isAuthenticating: boolean;
  /** Whether the device supports any form of biometric/passcode auth */
  hasBiometrics: boolean;
  /** Available auth types on this device */
  availableTypes: AuthenticationType[];
  /** Error from last auth attempt */
  authError: string | null;

  // Actions
  initializeLock: () => Promise<void>;
  enableLock: () => Promise<void>;
  disableLock: () => Promise<void>;
  authenticate: () => Promise<boolean>;
  lock: () => void;
}

// Invalidates stale policy loads and biometric prompts when a newer lock
// decision or foreground lock supersedes their asynchronous completion.
let lockGeneration = 0;
let policyWritePending = false;

export const useAppLockStore = create<AppLockState>((set, get) => ({
  isInitialized: false,
  isLockEnabled: false,
  isAuthenticated: false,
  isAuthenticating: false,
  hasBiometrics: false,
  availableTypes: [],
  authError: null,

  initializeLock: async () => {
    if (policyWritePending) return;
    const generation = ++lockGeneration;
    // Keep wallet content gated during every (re)hydration.
    set({ isInitialized: false, isAuthenticated: false, isAuthenticating: false, authError: null });

    try {
      const storedLock = await AsyncStorage.getItem(LOCK_ENABLED_KEY);
      if (storedLock !== null && storedLock !== 'true' && storedLock !== 'false') {
        throw new Error('Invalid persisted app-lock state');
      }

      // A biometric capability probe must not turn a persisted lock OFF.
      const [hardware, enrollment] = await Promise.allSettled([
        hasHardwareAsync(),
        isEnrolledAsync(),
      ]);
      const hasBio =
        hardware.status === 'fulfilled' && hardware.value &&
        enrollment.status === 'fulfilled' && enrollment.value;

      if (generation !== lockGeneration) return;
      set({
        isInitialized: true,
        isLockEnabled: storedLock === 'true',
        hasBiometrics: hasBio,
        availableTypes: hasBio
          ? [AuthenticationType.FINGERPRINT, AuthenticationType.FACIAL_RECOGNITION]
          : [],
        isAuthenticated: storedLock !== 'true',
        authError: null,
      });
    } catch {
      if (generation !== lockGeneration) return;
      // Unknown or unreadable lock settings are never treated as disabled.
      console.error('App lock initialization unavailable');
      set({
        isInitialized: false,
        isLockEnabled: true,
        isAuthenticated: false,
        hasBiometrics: false,
        availableTypes: [],
        authError: 'Cannot verify your lock settings. Retry to access the wallet.',
      });
    }
  },

  enableLock: async () => {
    if (policyWritePending) return;
    policyWritePending = true;
    ++lockGeneration;
    // A failed or ambiguous policy write cannot leave the wallet exposed.
    set({ isInitialized: false, isAuthenticated: false, isAuthenticating: false, authError: null });
    try {
      const [hardware, enrollment] = await Promise.allSettled([
        hasHardwareAsync(),
        isEnrolledAsync(),
      ]);
      const hasBio =
        hardware.status === 'fulfilled' && hardware.value &&
        enrollment.status === 'fulfilled' && enrollment.value;
      await AsyncStorage.setItem(LOCK_ENABLED_KEY, 'true');
      set({
        isInitialized: true,
        isLockEnabled: true,
        isAuthenticated: false,
        hasBiometrics: hasBio,
        availableTypes: hasBio
          ? [AuthenticationType.FINGERPRINT, AuthenticationType.FACIAL_RECOGNITION]
          : [],
        authError: null,
      });
    } catch {
      console.error('App lock policy update unavailable');
      set({
        isInitialized: false,
        isLockEnabled: true,
        isAuthenticated: false,
        authError: 'Cannot verify your lock settings. Retry to access the wallet.',
      });
    } finally {
      policyWritePending = false;
    }
  },

  disableLock: async () => {
    if (policyWritePending || !get().isInitialized) return;
    policyWritePending = true;
    ++lockGeneration;
    set({ isInitialized: false, isAuthenticated: false, isAuthenticating: false });
    try {
      // Only unlock AFTER disabling is durably stored. A rejected write can
      // mean an unknown persisted state, so require a fresh policy read.
      await AsyncStorage.setItem(LOCK_ENABLED_KEY, 'false');
      set({
        isInitialized: true,
        isLockEnabled: false,
        isAuthenticated: true,
        authError: null,
      });
      try {
        await AsyncStorage.removeItem(LAST_AUTH_KEY);
      } catch {
        // Removing the historical timestamp is non-critical.
      }
    } catch {
      console.error('App lock policy update unavailable');
      set({
        isInitialized: false,
        isLockEnabled: true,
        isAuthenticated: false,
        authError: 'Cannot verify your lock settings. Retry to access the wallet.',
      });
    } finally {
      policyWritePending = false;
    }
  },

  authenticate: async () => {
    const { isAuthenticating, isInitialized, isLockEnabled } = get();
    if (isAuthenticating || !isInitialized || !isLockEnabled || policyWritePending) return false;
    const generation = ++lockGeneration;

    set({ isAuthenticating: true, authError: null });

    try {
      const result = await authenticateAsync({
        promptMessage: 'Unlock PocketPay',
        fallbackLabel: 'Use device passcode',
        cancelLabel: 'Cancel',
      });
      if (generation !== lockGeneration) return false;

      if (result.success) {
        set({ isAuthenticated: true, isAuthenticating: false, authError: null });
        try {
          await AsyncStorage.setItem(LAST_AUTH_KEY, Date.now().toString());
        } catch { /* non-critical */ }
        return generation === lockGeneration;
      }

      // User cancelled or failed
      if (result.error === 'user_cancel' || result.error === 'system_cancel') {
        set({ isAuthenticating: false, authError: null });
      } else {
        set({
          isAuthenticating: false,
          authError: result.error || 'Authentication failed',
        });
      }
      return false;
    } catch {
      if (generation !== lockGeneration) return false;
      set({
        isAuthenticating: false,
        authError: 'Authentication error',
      });
      return false;
    }
  },

  lock: () => {
    ++lockGeneration;
    set({ isAuthenticated: false, isAuthenticating: false, authError: null });
  },
}));
