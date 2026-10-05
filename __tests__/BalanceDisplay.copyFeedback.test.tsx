import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

const PUBLIC_KEY = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));

jest.mock('../src/hooks/useTheme', () => {
  const { COLORS } = jest.requireActual('../src/constants/theme');
  return {
    useTheme: () => ({
      colors: COLORS,
      isDark: true,
      themeMode: 'dark',
      setThemeMode: jest.fn(),
    }),
  };
});

jest.mock('lucide-react-native', () => ({
  RefreshCw: () => null,
  AlertTriangle: () => null,
  EyeOff: () => null,
  Copy: () => null,
  Check: () => null,
}));

import { BalanceDisplay } from '../src/components/BalanceDisplay';

const mockSetStringAsync = Clipboard.setStringAsync as jest.MockedFunction<
  typeof Clipboard.setStringAsync
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockSetStringAsync.mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('BalanceDisplay wallet address copy feedback', () => {
  it('copies the public address and shows brief success feedback', async () => {
    const { getByLabelText, getByText } = render(
      <BalanceDisplay
        state="available"
        balance="12.5000000"
        publicKey={PUBLIC_KEY}
      />,
    );

    fireEvent.press(getByLabelText('Copy wallet address'));

    await waitFor(() => {
      expect(mockSetStringAsync).toHaveBeenCalledWith(PUBLIC_KEY);
      expect(getByText('Copied')).toBeTruthy();
      expect(getByLabelText('Wallet address copied')).toBeTruthy();
    });
  });

  it('shows a generic error without exposing the address when copying fails', async () => {
    mockSetStringAsync.mockRejectedValueOnce(new Error('clipboard unavailable'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByLabelText } = render(
      <BalanceDisplay
        state="available"
        balance="12.5000000"
        publicKey={PUBLIC_KEY}
      />,
    );

    fireEvent.press(getByLabelText('Copy wallet address'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Copy Failed',
        'Failed to copy to clipboard. Please try again.',
      );
    });

    expect(alertSpy.mock.calls[0]?.join(' ')).not.toContain(PUBLIC_KEY);
    errorSpy.mockRestore();
  });
});
