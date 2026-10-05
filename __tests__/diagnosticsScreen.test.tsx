import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { useWalletStore } from '../src/store/walletStore';
import { useVaultStore } from '../src/store/vaultStore';
import { walletFixture } from '../tests/fixtures/wallet';
import DiagnosticsScreen from '../app/diagnostics';

jest.mock('../src/store/walletStore');
jest.mock('../src/store/vaultStore');
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>{`Redirect: ${href}`}</Text>;
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0', sdkVersion: '54.0.0', name: 'PocketPay' } },
}));

const mockUseWalletStore = jest.mocked(useWalletStore);
const mockUseVaultStore = jest.mocked(useVaultStore);
const originalDev = __DEV__;
const originalEnvironment = { ...process.env };

describe('DiagnosticsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__DEV__ = true;
    process.env.EXPO_PUBLIC_STELLAR_NETWORK = 'TESTNET';
    process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL = 'https://horizon-testnet.stellar.org';
    mockUseWalletStore.mockReturnValue({ publicKey: walletFixture.publicKey, error: null } as any);
    mockUseVaultStore.mockReturnValue({ balanceError: null, isConfigured: true } as any);
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  });

  afterEach(() => {
    (globalThis as any).__DEV__ = originalDev;
    process.env = { ...originalEnvironment };
  });

  it('renders the development environment, network, and wallet state', async () => {
    const { getByText, queryByText } = render(<DiagnosticsScreen />);
    await waitFor(() => expect(getByText('Available')).toBeTruthy());
    expect(getByText('1.0.0')).toBeTruthy();
    expect(getByText('Development')).toBeTruthy();
    expect(getByText('TESTNET')).toBeTruthy();
    expect(getByText('horizon-testnet.stellar.org')).toBeTruthy();
    expect(getByText('Connected')).toBeTruthy();
    expect(getByText(`${walletFixture.publicKey.slice(0, 6)}...${walletFixture.publicKey.slice(-6)}`)).toBeTruthy();
    expect(queryByText(walletFixture.publicKey)).toBeNull();
    expect(queryByText('Recent Errors')).toBeNull();
  });

  it('surfaces storage unavailability when the device check fails', async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('storage unavailable'));
    const { getByText } = render(<DiagnosticsScreen />);
    await waitFor(() => expect(getByText('Unavailable')).toBeTruthy());
  });

  it('shows both wallet and vault errors', async () => {
    mockUseWalletStore.mockReturnValue({ publicKey: walletFixture.publicKey, error: 'Network request failed' } as any);
    mockUseVaultStore.mockReturnValue({ balanceError: 'Vault unavailable', isConfigured: true } as any);
    const { getByText } = render(<DiagnosticsScreen />);
    await waitFor(() => expect(getByText('Recent Errors')).toBeTruthy());
    expect(getByText('Wallet: Network request failed')).toBeTruthy();
    expect(getByText('Vault: Vault unavailable')).toBeTruthy();
  });

  it('redirects production builds without probing storage', () => {
    (globalThis as any).__DEV__ = false;
    const { getByText } = render(<DiagnosticsScreen />);
    expect(getByText('Redirect: /(tabs)')).toBeTruthy();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
