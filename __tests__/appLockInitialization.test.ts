jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
  SecurityLevel: {},
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuth from 'expo-local-authentication';
import { useAppLockStore } from '../src/store/appLockStore';

const read = AsyncStorage.getItem as jest.Mock;
const hardware = LocalAuth.hasHardwareAsync as jest.Mock;
const enrolled = LocalAuth.isEnrolledAsync as jest.Mock;

describe('app-lock policy rehydration (#398)', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    log = jest.spyOn(console, 'error').mockImplementation(() => {});
    useAppLockStore.setState({
      isInitialized: false,
      isLockEnabled: false,
      isAuthenticated: false,
      hasBiometrics: false,
      availableTypes: [],
      authError: null,
      isAuthenticating: false,
    });
    read.mockResolvedValue('true');
    hardware.mockResolvedValue(true);
    enrolled.mockResolvedValue(true);
  });

  afterEach(() => log.mockRestore());

  it('never authenticates a previously locked wallet during asynchronous rehydration', async () => {
    const pending = useAppLockStore.getState().initializeLock();
    expect(useAppLockStore.getState().isInitialized).toBe(false);
    expect(useAppLockStore.getState().isAuthenticated).toBe(false);
    await pending;
    expect(useAppLockStore.getState()).toMatchObject({
      isInitialized: true,
      isLockEnabled: true,
      isAuthenticated: false,
      hasBiometrics: true,
    });
  });

  it('fails closed without exposing provider errors when lock settings cannot be read', async () => {
    read.mockRejectedValueOnce(new Error('sensitive-provider-detail'));
    await useAppLockStore.getState().initializeLock();
    expect(useAppLockStore.getState()).toMatchObject({
      isInitialized: false,
      isLockEnabled: true,
      isAuthenticated: false,
      authError: 'Cannot verify your lock settings. Retry to access the wallet.',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive-provider-detail');
  });

  it('retains the stored lock after failed biometric capability probes', async () => {
    hardware.mockRejectedValueOnce(new Error('hardware unavailable'));
    enrolled.mockRejectedValueOnce(new Error('enrollment unavailable'));
    await useAppLockStore.getState().initializeLock();
    expect(useAppLockStore.getState()).toMatchObject({
      isInitialized: true,
      isLockEnabled: true,
      isAuthenticated: false,
      hasBiometrics: false,
    });
  });

  it('never unlocks when disabling the persisted lock fails', async () => {
    await useAppLockStore.getState().initializeLock();
    expect(useAppLockStore.getState().isLockEnabled).toBe(true);

    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('private-provider-detail'),
    );
    await useAppLockStore.getState().disableLock();

    expect(useAppLockStore.getState()).toMatchObject({
      isInitialized: false,
      isLockEnabled: true,
      isAuthenticated: false,
      authError: 'Cannot verify your lock settings. Retry to access the wallet.',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-provider-detail');
  });

  it('does not publish a new lock policy until the storage write completes', async () => {
    read.mockResolvedValueOnce('false');
    await useAppLockStore.getState().initializeLock();
    expect(useAppLockStore.getState().isLockEnabled).toBe(false);

    let persist!: () => void;
    (AsyncStorage.setItem as jest.Mock).mockReturnValueOnce(
      new Promise<void>((resolve) => { persist = resolve; }),
    );
    const pending = useAppLockStore.getState().enableLock();
    expect(useAppLockStore.getState()).toMatchObject({
      isInitialized: false,
      isAuthenticated: false,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(useAppLockStore.getState().isInitialized).toBe(false);
    persist();
    await pending;
    expect(useAppLockStore.getState()).toMatchObject({
      isInitialized: true,
      isLockEnabled: true,
      isAuthenticated: false,
    });
  });

  it('ignores an old biometric success after a newer foreground lock', async () => {
    await useAppLockStore.getState().initializeLock();
    let resolveAuthentication!: (result: { success: boolean }) => void;
    (LocalAuth.authenticateAsync as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolveAuthentication = resolve; }),
    );
    const pending = useAppLockStore.getState().authenticate();
    expect(useAppLockStore.getState().isAuthenticating).toBe(true);

    useAppLockStore.getState().lock();
    resolveAuthentication({ success: true });
    expect(await pending).toBe(false);
    expect(useAppLockStore.getState()).toMatchObject({
      isLockEnabled: true,
      isAuthenticated: false,
      isAuthenticating: false,
    });
  });

  it('recovers on a new successful read without inventing a required lock', async () => {
    read.mockRejectedValueOnce(new Error('temporary storage')).mockResolvedValueOnce('false');
    await useAppLockStore.getState().initializeLock();
    expect(useAppLockStore.getState().isInitialized).toBe(false);
    await useAppLockStore.getState().initializeLock();
    expect(useAppLockStore.getState()).toMatchObject({
      isInitialized: true,
      isLockEnabled: false,
      isAuthenticated: true,
      authError: null,
    });
  });
});
