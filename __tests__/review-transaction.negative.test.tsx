import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-router');
jest.mock('../src/services/stellar', () => {
  class TransactionSubmissionUnknownError extends Error {
    hash: string;
    constructor(hash: string) {
      super('Network submission status is unknown.');
      this.name = 'TransactionSubmissionUnknownError';
      this.hash = hash;
    }
  }
  class TransactionSubmissionRejectedError extends Error {
    resultCode: string;
    constructor(resultCode: string) {
      super('Network rejected the transaction.');
      this.name = 'TransactionSubmissionRejectedError';
      this.resultCode = resultCode;
    }
  }
  return {
    server: { fetchBaseFee: jest.fn(async () => 100) },
    sendXlmTransaction: jest.fn(),
    checkSubmittedTransaction: jest.fn(),
    TransactionSubmissionUnknownError,
    TransactionSubmissionRejectedError,
  };
});
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
    ReviewConfirm: ({ items, confirmLabel, onConfirm, cancelLabel, onCancel }: any) => (
      <View>
        {items.map((item: any) => (
          <Text key={item.label}>{item.value}</Text>
        ))}
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
import { sendXlmTransaction, checkSubmittedTransaction, TransactionSubmissionUnknownError, TransactionSubmissionRejectedError } from '../src/services/stellar';
import { useWalletStore } from '../src/store/walletStore';
import { useSignerStore } from '../src/store/signerStore';
import ReviewTransactionScreen from '../app/review-transaction';
import { UNCONFIRMED_SUBMISSION_MESSAGE } from '../src/utils/paymentErrors';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<typeof useLocalSearchParams>;
const mockUseWalletStore = useWalletStore as jest.MockedFunction<typeof useWalletStore>;
const mockSendXlmTransaction = sendXlmTransaction as jest.MockedFunction<typeof sendXlmTransaction>;
const mockCheckSubmittedTransaction = checkSubmittedTransaction as jest.MockedFunction<typeof checkSubmittedTransaction>;

const mockBack = jest.fn();
const mockReplace = jest.fn();

describe('ReviewTransactionScreen negative paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSignerStore.getState().reset();
    mockUseRouter.mockReturnValue({
      back: mockBack,
      replace: mockReplace,
      push: jest.fn(),
    } as any);
    mockUseLocalSearchParams.mockReturnValue({
      destination: 'GDEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD',
      amount: '10',
      memo: 'invoice-42',
    } as any);
    mockUseWalletStore.mockReturnValue({
      publicKey: 'GSOURCE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABC',
      getSecretKey: jest.fn(async () => 'SSECRET123'),
      refreshWalletData: jest.fn(),
      addPendingTransaction: jest.fn(),
    } as any);
  });

  it('shows a safe unconfirmed-submission message when the network request fails', async () => {
    mockSendXlmTransaction.mockRejectedValueOnce(new Error('fetch failed'));

    const { getByText } = render(<ReviewTransactionScreen />);
    fireEvent.press(getByText('Sign & Send'));

    await waitFor(() => {
      expect(getByText('Transaction Failed')).toBeTruthy();
      expect(getByText(UNCONFIRMED_SUBMISSION_MESSAGE)).toBeTruthy();
      expect(getByText('Go Back')).toBeTruthy();
    });
  });

  it('surfaces a clear insufficient-balance failure from submission', async () => {
    mockSendXlmTransaction.mockRejectedValueOnce(new Error('op_underfunded'));

    const { getByText } = render(<ReviewTransactionScreen />);
    fireEvent.press(getByText('Sign & Send'));

    await waitFor(() => {
      expect(getByText('Transaction Failed')).toBeTruthy();
      expect(getByText(UNCONFIRMED_SUBMISSION_MESSAGE)).toBeTruthy();
    });
  });

  it('holds a signed, unconfirmed payment by hash and offers safe status lookup', async () => {
    const hash = 'ab'.repeat(32);
    mockSendXlmTransaction.mockRejectedValueOnce(new TransactionSubmissionUnknownError(hash));
    mockCheckSubmittedTransaction.mockResolvedValueOnce('not_found');

    const { getByText, queryByText } = render(<ReviewTransactionScreen />);
    fireEvent.press(getByText('Sign & Send'));

    await waitFor(() => {
      expect(getByText('Status Unknown')).toBeTruthy();
      expect(getByText('Unconfirmed')).toBeTruthy();
      expect(getByText('Check Status')).toBeTruthy();
      expect(queryByText('Sign & Send')).toBeNull();
    });
    expect(mockUseWalletStore().addPendingTransaction).toHaveBeenCalledWith(hash, expect.objectContaining({ id: hash }));

    fireEvent.press(getByText('View Details'));
    expect(getByText('Hash: ' + hash)).toBeTruthy();
    fireEvent.press(getByText('Check Status'));
    await waitFor(() => {
      expect(getByText('Not yet found on Horizon; this is not proof of failure.')).toBeTruthy();
    });
    expect(mockCheckSubmittedTransaction).toHaveBeenCalledWith(hash);
    fireEvent.press(getByText('View Wallet History'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/history');
  });

  it('treats an explicit Horizon result code as a rejection, not an unknown payment', async () => {
    mockSendXlmTransaction.mockRejectedValueOnce(new TransactionSubmissionRejectedError('tx_bad_seq'));
    const { getByText, queryByText } = render(<ReviewTransactionScreen />);
    fireEvent.press(getByText('Sign & Send'));
    await waitFor(() => {
      expect(getByText('Transaction Failed')).toBeTruthy();
      expect(getByText('Network rejected this transaction (tx_bad_seq).')).toBeTruthy();
    });
    expect(queryByText('Check Status')).toBeNull();
  });

  it('shows the cancelled state clearly when signing is aborted before submission', () => {
    useSignerStore.getState().cancelSigning();

    const { getByText } = render(<ReviewTransactionScreen />);

    expect(getByText('Cancelled')).toBeTruthy();
    expect(getByText('Signing was cancelled. No transaction was submitted.')).toBeTruthy();
    expect(getByText('Go Back')).toBeTruthy();
  });
});
