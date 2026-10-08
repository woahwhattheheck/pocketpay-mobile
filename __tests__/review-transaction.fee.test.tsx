import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router');
jest.mock('../src/services/stellar', () => ({
  server: {
    fetchBaseFee: jest.fn(),
  },
  sendXlmTransaction: jest.fn(),
}));
jest.mock('../src/store/walletStore');
jest.mock('../src/store/appStore', () => ({
  useAppStore: jest.fn((selector) => {
    const state = { contacts: [] };
    return selector ? selector(state) : state;
  }),
}));
jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000000',
      surface: '#111111',
      textPrimary: '#ffffff',
      textSecondary: '#bbbbbb',
      textMuted: '#999999',
      primary: '#00E5FF',
      success: '#00C853',
      warning: '#FFB300',
      error: '#FF5252',
      border: '#333333',
    },
  }),
}));
jest.mock('lucide-react-native', () => ({
  ArrowRight: () => null,
  Smartphone: () => null,
  AlertTriangle: () => null,
  CheckCircle: () => null,
  XCircle: () => null,
}));
jest.mock('@/components', () => {
  const React = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');

  return {
    Button: ({ title, onPress }: any) => (
      <TouchableOpacity onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
    LoadingState: ({ accessibilityLabel }: any) => <Text>{accessibilityLabel}</Text>,
    ReviewConfirm: ({ items, confirmLabel, onConfirm, cancelLabel, onCancel, note }: any) => (
      <View>
        {items.map((item: any) => (
          <View key={item.label}>
            <Text>{item.label}</Text>
            <Text>{item.value}</Text>
          </View>
        ))}
        {typeof note === 'string' ? <Text>{note}</Text> : note}
        {confirmLabel ? (
          <TouchableOpacity onPress={onConfirm}>
            <Text>{confirmLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {cancelLabel ? (
          <TouchableOpacity onPress={onCancel}>
            <Text>{cancelLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ),
    ReviewItem: () => null,
    ScreenHeader: ({ title, subtitle }: any) => (
      <View>
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    ),
    StatusBadge: ({ text }: any) => <Text>{text}</Text>,
  };
});

import { useRouter, useLocalSearchParams } from 'expo-router';
import { server, sendXlmTransaction } from '../src/services/stellar';
import { useWalletStore } from '../src/store/walletStore';
import { useSignerStore } from '../src/store/signerStore';
import ReviewTransactionScreen from '../app/review-transaction';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<typeof useLocalSearchParams>;
const mockUseWalletStore = useWalletStore as jest.MockedFunction<typeof useWalletStore>;
const mockFetchBaseFee = server.fetchBaseFee as jest.MockedFunction<typeof server.fetchBaseFee>;
const mockSendXlmTransaction = sendXlmTransaction as jest.MockedFunction<typeof sendXlmTransaction>;

describe('ReviewTransactionScreen fee estimate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSignerStore.getState().reset();

    mockUseRouter.mockReturnValue({
      back: jest.fn(),
      replace: jest.fn(),
      push: jest.fn(),
    } as any);
    mockUseLocalSearchParams.mockReturnValue({
      destination: 'GDESTINATION',
      amount: '10',
      memo: 'invoice-42',
    } as any);
    mockUseWalletStore.mockReturnValue({
      publicKey: 'GSOURCE',
      getSecretKey: jest.fn(async () => 'test-signer-placeholder'),
      refreshWalletData: jest.fn(),
      addPendingTransaction: jest.fn(),
    } as any);
    mockSendXlmTransaction.mockReset();
  });

  it('shows the network fee estimate before the user confirms', async () => {
    mockFetchBaseFee.mockResolvedValueOnce(100);

    const { getByText } = render(<ReviewTransactionScreen />);

    expect(getByText('Estimating…')).toBeTruthy();

    await waitFor(() => {
      expect(getByText('~100 stroops')).toBeTruthy();
    });

    expect(getByText('Estimated fee')).toBeTruthy();
    expect(getByText('Sign & Send')).toBeTruthy();
    expect(mockSendXlmTransaction).not.toHaveBeenCalled();
    expect(mockFetchBaseFee).toHaveBeenCalledTimes(1);
  });

  it('shows a safe unavailable state when fee estimation fails', async () => {
    mockFetchBaseFee.mockRejectedValueOnce(new Error('provider details should stay hidden'));

    const { getByText, queryByText } = render(<ReviewTransactionScreen />);

    await waitFor(() => {
      expect(getByText('Unavailable')).toBeTruthy();
    });

    expect(getByText('Estimated fee')).toBeTruthy();
    expect(getByText('Sign & Send')).toBeTruthy();
    expect(
      getByText(
        'Network fee is estimated before confirmation. If the estimate is unavailable, you can still send and the transaction builder will use the network fee available at submission time.',
      ),
    ).toBeTruthy();
    expect(queryByText(/provider details/i)).toBeNull();
    expect(mockFetchBaseFee).toHaveBeenCalledTimes(1);
  });
});
