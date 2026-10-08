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

export const useAppLockStore = create<AppLockState>((set, get) => ({
  isInitialized: false,
  isLockEnabled: false,
  isAuthenticated: false,
  isAuthenticating: false,
  hasBiometrics: false,
  availableTypes: [],
  authError: null,

  initializeLock: async () => {
    // Keep wallet content gated during every (re)hydration.
    set({ isInitialized: false, isAuthenticated: false, authError: null });

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
    try {
      // Verify biometrics are available before enabling
      const [hasHW, enrolled] = await Promise.all([
        hasHardwareAsync(),
        isEnrolledAsync(),
      ]);

      if (!hasHW || !enrolled) {
        // Allow enabling even without biometrics — will fall back to device PIN/pattern
        set({
          isLockEnabled: true,
          hasBiometrics: false,
          availableTypes: [],
        });
        await AsyncStorage.setItem(LOCK_ENABLED_KEY, 'true');
        return;
      }

      set({
        isLockEnabled: true,
        hasBiometrics: true,
        availableTypes: [AuthenticationType.FINGERPRINT, AuthenticationType.FACIAL_RECOGNITION],
      });
      await AsyncStorage.setItem(LOCK_ENABLED_KEY, 'true');
    } catch (err) {
      console.error('Failed to enable app lock:', err);
    }
  },

  disableLock: async () => {
    set({ isLockEnabled: false, isAuthenticated: true, authError: null });
    await AsyncStorage.setItem(LOCK_ENABLED_KEY, 'false');
    try {
      await AsyncStorage.removeItem(LAST_AUTH_KEY);
    } catch {
      // Non-critical
    }
  },

  authenticate: async () => {
    const { isAuthenticating } = get();
    if (isAuthenticating) return false;

    set({ isAuthenticating: true, authError: null });

    try {
      const result = await authenticateAsync({
        promptMessage: 'Unlock PocketPay',
        fallbackLabel: 'Use device passcode',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        set({ isAuthenticated: true, isAuthenticating: false, authError: null });
        try {
          await AsyncStorage.setItem(LAST_AUTH_KEY, Date.now().toString());
        } catch { /* non-critical */ }
        return true;
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
    } catch (err: any) {
      set({
        isAuthenticating: false,
        authError: err?.message || 'Authentication error',
      });
      return false;
    }
  },

  lock: () => {
    set({ isAuthenticated: false, authError: null });
  },
}));
