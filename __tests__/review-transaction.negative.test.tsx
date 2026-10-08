import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-router');
jest.mock('../src/services/stellar', () => {
  class PaymentSendError extends Error {
    submissionAttempted: boolean;
    definitiveRejection: boolean;
    transactionHash: string | null;

    constructor(
      message: string,
      submissionAttempted: boolean,
      definitiveRejection: boolean,
      transactionHash: string | null,
    ) {
      super(message);
      this.name = 'PaymentSendError';
      this.submissionAttempted = submissionAttempted;
      this.definitiveRejection = definitiveRejection;
      this.transactionHash = transactionHash;
    }
  }

  return {
    server: {
      fetchBaseFee: jest.fn(async () => 100),
    },
    sendXlmTransaction: jest.fn(),
    PaymentSendError,
  };
});
jest.mock('../src/store/walletStore');
jest.mock('../src/store/appStore', () => ({
  normalizePublicKey: (value: string) => value.trim(),
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
import { PaymentSendError, sendXlmTransaction } from '../src/services/stellar';
import { useWalletStore } from '../src/store/walletStore';
import { useSignerStore } from '../src/store/signerStore';
import ReviewTransactionScreen from '../app/review-transaction';
import { UNCONFIRMED_SUBMISSION_MESSAGE } from '../src/utils/paymentErrors';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<typeof useLocalSearchParams>;
const mockUseWalletStore = useWalletStore as jest.MockedFunction<typeof useWalletStore>;
const mockSendXlmTransaction = sendXlmTransaction as jest.MockedFunction<typeof sendXlmTransaction>;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockAddPendingTransaction = jest.fn();
const sourcePublicKey = 'GSOURCE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABC';
const walletState = {
  publicKey: sourcePublicKey,
  getSecretKey: jest.fn(async () => 'SSECRET123'),
  refreshWalletData: jest.fn(),
  addPendingTransaction: mockAddPendingTransaction,
};

describe('ReviewTransactionScreen negative paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSignerStore.setState({
      phase: 'idle',
      currentReview: null,
      lastResult: null,
      error: null,
    });
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
    mockUseWalletStore.mockImplementation(() => walletState as any);
    (useWalletStore as unknown as { getState: () => typeof walletState }).getState = () => walletState;
  });

  it('shows a safe unconfirmed-submission message when the network request fails', async () => {
    mockSendXlmTransaction.mockRejectedValueOnce(
      new PaymentSendError(
        'The payment outcome is not confirmed. Check history before retrying.',
        true,
        false,
        'abc123hash',
      ),
    );

    const { getByText } = render(<ReviewTransactionScreen />);
    fireEvent.press(getByText('Sign & Send'));

    await waitFor(() => {
      expect(getByText('Transaction Status Unknown')).toBeTruthy();
      expect(getByText(UNCONFIRMED_SUBMISSION_MESSAGE)).toBeTruthy();
      expect(getByText('Check Transaction History')).toBeTruthy();
    });
    expect(mockAddPendingTransaction).toHaveBeenCalledWith(
      'abc123hash',
      expect.objectContaining({ id: 'abc123hash', from: sourcePublicKey }),
      sourcePublicKey,
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('surfaces a clear insufficient-balance failure from submission', async () => {
    mockSendXlmTransaction.mockRejectedValueOnce(
      new PaymentSendError('op_underfunded', true, true, 'rejectedhash'),
    );

    const { getByText, queryByText } = render(<ReviewTransactionScreen />);
    fireEvent.press(getByText('Sign & Send'));

    await waitFor(() => {
      expect(getByText('Transaction Failed')).toBeTruthy();
      expect(getByText(/does not have enough XLM/)).toBeTruthy();
    });
    expect(queryByText(UNCONFIRMED_SUBMISSION_MESSAGE)).toBeNull();
    expect(mockAddPendingTransaction).not.toHaveBeenCalled();
  });

  it('cancels a review before submission when the user goes back to edit', () => {
    const { getByText } = render(<ReviewTransactionScreen />);

    fireEvent.press(getByText('Back to Edit'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockSendXlmTransaction).not.toHaveBeenCalled();
    expect(useSignerStore.getState().phase).toBe('idle');
  });
});
