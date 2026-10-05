import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/store/walletStore', () => ({
  useWalletStore: jest.fn(),
}));

jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000000',
      surface: '#111111',
      surfaceLight: '#222222',
      textPrimary: '#ffffff',
      textSecondary: '#dddddd',
      textMuted: '#999999',
      border: '#444444',
      primary: '#00e5ff',
      secondary: '#7b61ff',
      error: '#ff5555',
    },
    isDark: true,
    themeMode: 'dark',
    setThemeMode: jest.fn(),
  }),
}));

jest.mock('../src/utils/clipboard', () => ({
  useCopyToClipboard: () => ({
    copy: jest.fn(),
    copiedField: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../src/hooks/useNetworkState', () => ({
  useNetworkState: () => ({
    state: 'online',
    retry: jest.fn(),
    disableWriteActions: false,
    isChecking: false,
    isOnline: true,
  }),
}));

jest.mock('../src/components/NetworkStatusBanner', () => ({
  NetworkStatusBanner: () => null,
}));

jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockQRCode({ value }: { value: string }) {
    return <Text testID="receive-qr">{value}</Text>;
  };
});

jest.mock('lucide-react-native', () => ({
  Eye: () => null,
  EyeOff: () => null,
}));

import { useWalletStore } from '../src/store/walletStore';
import ReceiveScreen from '../app/receive';

const mockUseWalletStore = useWalletStore as jest.MockedFunction<typeof useWalletStore>;
const VALID_DESTINATION = 'G' + 'A'.repeat(55);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseWalletStore.mockReturnValue({
    publicKey: VALID_DESTINATION,
    error: null,
  } as any);
});

describe('ReceiveScreen QR validation', () => {
  it('renders the QR only for a valid receive payload', () => {
    const { getByTestId, queryByText } = render(<ReceiveScreen />);

    expect(getByTestId('receive-qr').props.children).toBe(VALID_DESTINATION);
    expect(queryByText('Unable to create receive QR')).toBeNull();
  });

  it('shows a blocking invalid state for a malformed wallet address', () => {
    mockUseWalletStore.mockReturnValue({
      publicKey: 'not-a-stellar-address',
      error: null,
    } as any);

    const { getByText, queryByTestId } = render(<ReceiveScreen />);

    expect(queryByTestId('receive-qr')).toBeNull();
    expect(getByText('Unable to create receive QR')).toBeTruthy();
    expect(getByText(/valid Stellar address/)).toBeTruthy();
  });

  it('does not silently drop an invalid requested amount', () => {
    const { getByText, getAllByText, getByPlaceholderText, queryByTestId } = render(<ReceiveScreen />);

    fireEvent.press(getByText('Request a specific amount'));
    fireEvent.changeText(getByPlaceholderText('0.00'), '-1');

    expect(queryByTestId('receive-qr')).toBeNull();
    expect(getByText('Unable to create receive QR')).toBeTruthy();
    // The field and the QR-blocking summary both explain the invalid amount.
    expect(getAllByText('Please enter a valid number.')).toHaveLength(2);
  });
});
