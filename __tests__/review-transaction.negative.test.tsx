import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router');
jest.mock('../src/services/stellar', () => ({
  server: {
    fetchBaseFee: jest.fn(async () => 100),
  },
  sendXlmTransaction: jest.fn(),
}));
jest.mock('../src/store/walletStore');
jest.mock('../src/store/appStore', () => ({
  normalizePublicKey: (key: string) => key.trim().toUpperCase(),
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
import { sendXlmTransaction } from '../src/services/stellar';
import { useWalletStore } from '../src/store/walletStore';
import { useSignerStore } from '../src/store/signerStore';
import ReviewTransactionScreen from '../app/review-transaction';
import { UnknownPaymentSubmissionError } from '../src/features/payments/submissionOutcome';
import { server } from '../src/services/stellar';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<typeof useLocalSearchParams>;
const mockUseWalletStore = useWalletStore as jest.MockedFunction<typeof useWalletStore>;
const mockSendXlmTransaction = sendXlmTransaction as jest.MockedFunction<typeof sendXlmTransaction>;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockAddPending = jest.fn();

describe('ReviewTransactionScreen negative paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSignerStore.setState({ activeSubmission: null, unknownSubmission: null });
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
      addPendingTransaction: mockAddPending,
    } as any);
  });

  it('shows a safe preparation failure when no broadcast was made', async () => {
    mockSendXlmTransaction.mockRejectedValueOnce(new Error('fetch failed'));

    const { getByText } = render(<ReviewTransactionScreen />);
    fireEvent.press(getByText('Sign & Send'));

    await waitFor(() => {
      expect(getByText('Transaction Failed')).toBeTruthy();
      expect(getByText('The payment could not be submitted. Review your details and connection before trying again.')).toBeTruthy();
      expect(getByText('Go Back')).toBeTruthy();
    });
  });

  it('surfaces a clear insufficient-balance failure from submission', async () => {
    mockSendXlmTransaction.mockRejectedValueOnce(new Error('op_underfunded'));

    const { getByText } = render(<ReviewTransactionScreen />);
    fireEvent.press(getByText('Sign & Send'));

    await waitFor(() => {
      expect(getByText('Transaction Failed')).toBeTruthy();
      expect(getByText('The payment could not be submitted. Review your details and connection before trying again.')).toBeTruthy();
    });
  });

  it('shows the cancelled state clearly when signing is aborted before submission', () => {
    const { getByText } = render(<ReviewTransactionScreen />);
    act(() => useSignerStore.getState().cancelSigning());

    expect(getByText('Signing was cancelled. No transaction was submitted.')).toBeTruthy();
    expect(getByText('Signing was cancelled. No transaction was submitted.')).toBeTruthy();
    expect(getByText('Go Back')).toBeTruthy();
  });

  it('routes an uncertain submitted payment to status guidance without offering another sign action', async () => {
    const hash = 'a'.repeat(64);
    mockSendXlmTransaction.mockRejectedValueOnce(new UnknownPaymentSubmissionError(hash));
    const ui = render(<ReviewTransactionScreen />);
    fireEvent.press(ui.getByText('Sign & Send'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/payment-retry'));
    expect(useSignerStore.getState().phase).toBe('unknown');
    expect(useSignerStore.getState().unknownSubmission?.transactionHash).toBe(hash);
    expect(ui.queryByText('Sign & Send')).toBeNull();
    expect(mockSendXlmTransaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the global attempt and original details across remounts before submission', async () => {
    let resolveFee!: (fee: number) => void;
    let rejectSubmit!: (error: Error) => void;
    (server.fetchBaseFee as jest.Mock).mockReturnValueOnce(new Promise((yes) => { resolveFee = yes; }));
    mockSendXlmTransaction.mockReturnValueOnce(new Promise((_, no) => { rejectSubmit = no; }) as any);
    const first = render(<ReviewTransactionScreen />);
    fireEvent.press(first.getByText('Sign & Send'));
    await waitFor(() => expect(server.fetchBaseFee).toHaveBeenCalled());
    first.unmount();
    mockUseLocalSearchParams.mockReturnValue({ destination: 'GOTHER', amount: '50', memo: 'second-payment' } as any);
    const second = render(<ReviewTransactionScreen />);
    expect(second.queryByText('Sign & Send')).toBeNull();
    expect(second.queryByText('second-payment')).toBeNull();
    await act(async () => resolveFee(100));
    expect(mockSendXlmTransaction).toHaveBeenCalledTimes(1);
    await act(async () => rejectSubmit(new UnknownPaymentSubmissionError('a'.repeat(64))));
    expect(useSignerStore.getState().unknownSubmission?.review.amount).toBe('10');
    expect(useSignerStore.getState().unknownSubmission?.review.destinationPublicKey).not.toBe('GOTHER');
  });

  it('preserves a confirmed payment if local pending-history bookkeeping fails', async () => {
    const hash = 'a'.repeat(64);
    mockSendXlmTransaction.mockResolvedValueOnce({ hash } as any);
    mockAddPending.mockImplementationOnce(() => { throw new Error('local history failed'); });
    const ui = render(<ReviewTransactionScreen />);
    fireEvent.press(ui.getByText('Sign & Send'));
    await waitFor(() => expect(ui.getByText('Transaction Confirmed')).toBeTruthy());
    expect(useSignerStore.getState().lastResult?.hash).toBe(hash);
    expect(ui.queryByText('Transaction Failed')).toBeNull();
    expect(mockSendXlmTransaction).toHaveBeenCalledTimes(1);
  });

  it('uses the completed attempt for the receipt even when reopened with other route parameters', async () => {
    const hash = 'a'.repeat(64);
    let resolveSubmit!: (result: any) => void;
    mockSendXlmTransaction.mockReturnValueOnce(new Promise((yes) => { resolveSubmit = yes; }) as any);
    mockUseLocalSearchParams.mockReturnValue({ destination: 'GDEST_ORIGINAL', amount: '3' } as any);
    const first = render(<ReviewTransactionScreen />);
    fireEvent.press(first.getByText('Sign & Send'));
    await waitFor(() => expect(mockSendXlmTransaction).toHaveBeenCalledTimes(1));
    first.unmount();
    mockUseLocalSearchParams.mockReturnValue({ destination: 'GOTHER', amount: '50', memo: 'new-memo' } as any);
    const second = render(<ReviewTransactionScreen />);
    expect(second.queryByText('new-memo')).toBeNull();
    await act(async () => resolveSubmit({ hash }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/payment-success',
      params: expect.objectContaining({ hash, amount: '3', destination: 'GDEST_ORIGINAL' }),
    }), { timeout: 4000 });
    expect(mockSendXlmTransaction).toHaveBeenCalledTimes(1);
  });

});
