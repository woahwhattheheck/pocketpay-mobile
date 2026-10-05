import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockClearWallet = jest.fn(async () => true);
const mockGetSecretKey = jest.fn(async () => null);
const mockEnableLock = jest.fn(async () => {});
const mockDisableLock = jest.fn(async () => {});
const mockAuthenticate = jest.fn(async () => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: '#000',
      surface: '#111',
      textPrimary: '#fff',
      textSecondary: '#bbb',
      textMuted: '#888',
      primary: '#0ff',
      success: '#0f0',
      warning: '#fc0',
      error: '#f33',
      border: '#333',
    },
  }),
}));

jest.mock('../src/store/walletStore', () => ({
  useWalletStore: () => ({
    clearWallet: mockClearWallet,
    getSecretKey: mockGetSecretKey,
  }),
}));

jest.mock('../src/store/appLockStore', () => ({
  useAppLockStore: () => ({
    isLockEnabled: false,
    enableLock: mockEnableLock,
    disableLock: mockDisableLock,
    authenticate: mockAuthenticate,
  }),
}));

jest.mock('../src/features/settings', () => ({
  useNetworkEnvironment: () => ({
    networkName: 'QA-CUSTOM',
    networkTier: 'custom',
    networkLabel: 'QA Custom Network',
    horizonHost: 'horizon.qa.example',
    sorobanHost: 'soroban.qa.example',
    vaultMode: 'configured',
    vaultContractLabel: 'CABCDE…UVWXYZ',
    warnings: [
      {
        severity: 'warning',
        title: 'Custom network configured',
        message: 'Verify the configured network before testing.',
      },
    ],
  }),
}));

jest.mock('../src/components/Button', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    Button: ({ title, onPress }: any) => (
      <TouchableOpacity onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../src/components/SecretKeyReveal', () => ({
  SecretKeyReveal: () => null,
}));

jest.mock('../src/components/WalletResetConfirmModal', () => ({
  WalletResetConfirmModal: () => null,
}));

jest.mock('lucide-react-native', () => ({
  Moon: () => null,
  Sun: () => null,
  Shield: () => null,
  Globe: () => null,
  AlertTriangle: () => null,
  Info: () => null,
}));

import SettingsScreen from '../app/(tabs)/settings';

describe('Settings environment and feature visibility', () => {
  const originalDev = global.__DEV__;

  afterEach(() => {
    global.__DEV__ = originalDev;
    jest.clearAllMocks();
  });

  it('shows safe environment, vault capability, warnings, and current network dynamically', () => {
    global.__DEV__ = true;

    const { getByText, queryByText } = render(<SettingsScreen />);

    expect(getByText('QA Custom Network')).toBeTruthy();
    expect(getByText('horizon.qa.example')).toBeTruthy();
    expect(getByText('Configured · CABCDE…UVWXYZ')).toBeTruthy();
    expect(getByText('Custom network configured')).toBeTruthy();
    expect(getByText('Verify the configured network before testing.')).toBeTruthy();
    expect(getByText('Network: QA Custom Network')).toBeTruthy();

    expect(queryByText(/https?:\/\//i)).toBeNull();
    expect(queryByText(/passphrase/i)).toBeNull();
  });

  it('shows development diagnostics, feature flag states, and an experimental warning', () => {
    global.__DEV__ = true;

    const { getByText, getAllByText, getByTestId } = render(<SettingsScreen />);

    expect(getByText('Diagnostics')).toBeTruthy();
    expect(getByText('Available in development builds; exports are redacted.')).toBeTruthy();
    expect(getByText('Vault Experimental')).toBeTruthy();
    expect(getByText('Debug Panel')).toBeTruthy();
    expect(getByText('New Send Flow')).toBeTruthy();
    expect(getAllByText('Enabled').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Disabled').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Experimental').length).toBeGreaterThanOrEqual(1);

    expect(getByTestId('settings-experimental-warning')).toBeTruthy();
    expect(getByText('Experimental features enabled')).toBeTruthy();

    fireEvent.press(getByText('App Diagnostics'));
    expect(mockPush).toHaveBeenCalledWith('/diagnostics');
  });

  it('keeps feature flags and diagnostics out of production settings while retaining environment visibility', () => {
    global.__DEV__ = false;

    const { getByText, queryByText } = render(<SettingsScreen />);

    expect(getByText('QA Custom Network')).toBeTruthy();
    expect(queryByText('Feature flags')).toBeNull();
    expect(queryByText('App Diagnostics')).toBeNull();
    expect(queryByText('Vault Experimental')).toBeNull();
    expect(queryByText('Experimental features enabled')).toBeNull();
  });
});
