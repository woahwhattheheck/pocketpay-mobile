import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
jest.mock('expo-router');
jest.mock('../src/services/stellar', () => ({ fetchPaymentSubmissionStatus: jest.fn() }));
jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../src/constants/theme').getColors(true) }),
}));

import { useRouter } from 'expo-router';
import { fetchPaymentSubmissionStatus } from '../src/services/stellar';
import { useSignerStore } from '../src/store/signerStore';
import PaymentRetryScreen from '../app/payment-retry';
import type { TransactionReview } from '../src/types/signer';

const hash = 'a'.repeat(64);
const review: TransactionReview = {
  requestId: 'test-attempt', sourcePublicKey: 'GSOURCE', destinationPublicKey: 'GDEST',
  amount: '1.25', assetCode: 'XLM', network: 'Testnet', createdAt: '2026-10-05T00:00:00Z', timeoutSeconds: 30,
};
const replace = jest.fn();
const lookup = fetchPaymentSubmissionStatus as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSignerStore.setState({ activeSubmission: null, unknownSubmission: null });
  useSignerStore.getState().reset();
  useSignerStore.getState().recordUnknownSubmission(hash, review);
  (useRouter as jest.Mock).mockReturnValue({ replace, back: jest.fn(), push: jest.fn() });
});

it('offers status/details/help without a retry or resend action', () => {
  const ui = render(<PaymentRetryScreen />);
  expect(ui.getByText('Payment Status Unknown')).toBeTruthy();
  expect(ui.getByText('Your payment may already have completed. Do not send it again until its result is confirmed.')).toBeTruthy();
  expect(ui.queryByText(/^(Retry|Resend|Sign & Send)$/)).toBeNull();
  fireEvent.press(ui.getByText('View Payment Details'));
  expect(ui.getByText('1.25 XLM')).toBeTruthy();
  expect(ui.getByText(hash)).toBeTruthy();
  const help = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  fireEvent.press(ui.getByText('Get Help'));
  expect(help).toHaveBeenCalledWith('Payment status help', expect.stringContaining('Never share your secret key'));
  help.mockRestore();
});

it('keeps uncertainty and original context after a not-yet-found lookup', async () => {
  lookup.mockResolvedValueOnce('unknown');
  const ui = render(<PaymentRetryScreen />);
  fireEvent.press(ui.getByText('Check Status'));
  await waitFor(() => expect(lookup).toHaveBeenCalledWith(hash));
  expect(ui.getByText('Payment Status Unknown')).toBeTruthy();
  fireEvent.press(ui.getByText('View Activity'));
  expect(useSignerStore.getState().unknownSubmission?.transactionHash).toBe(hash);
  expect(replace).toHaveBeenCalledWith('/(tabs)/history');
});

it.each([['confirmed', 'Payment Confirmed'], ['failed', 'Payment Not Completed']])('shows a definitive %s result before clearing the decision', async (result, title) => {
  lookup.mockResolvedValueOnce(result);
  const ui = render(<PaymentRetryScreen />);
  fireEvent.press(ui.getByText('Check Status'));
  await waitFor(() => expect(ui.getByText(title)).toBeTruthy());
  expect(useSignerStore.getState().unknownSubmission).not.toBeNull();
  fireEvent.press(ui.getByText('Done — View Activity'));
  expect(useSignerStore.getState().unknownSubmission).toBeNull();
});

it('shows safe lookup failure copy and prevents overlapping checks', async () => {
  let reject!: (error: Error) => void;
  lookup.mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
  const ui = render(<PaymentRetryScreen />);
  const button = ui.getByText('Check Status');
  fireEvent.press(button);
  fireEvent.press(button);
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(ui.getByText('Checking Status…')).toBeTruthy();
  await act(async () => reject(new Error('DUMMY_PRIVATE_PROVIDER_PAYLOAD')));
  expect(ui.getByText('Payment Status Unknown')).toBeTruthy();
  expect(ui.getByText(/This does not mean the payment failed/)).toBeTruthy();
  expect(ui.queryByText('DUMMY_PRIVATE_PROVIDER_PAYLOAD')).toBeNull();
});

it('provides activity guidance when no hash is available', () => {
  useSignerStore.getState().recordUnknownSubmission(undefined, review);
  const ui = render(<PaymentRetryScreen />);
  expect(ui.queryByText('Check Status')).toBeNull();
  expect(ui.getByText(/No transaction hash is available/)).toBeTruthy();
  expect(lookup).not.toHaveBeenCalled();
});

it('ignores a lookup result belonging to a replaced context', async () => {
  let resolve!: (status: string) => void;
  lookup.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  const ui = render(<PaymentRetryScreen />);
  fireEvent.press(ui.getByText('Check Status'));
  act(() => useSignerStore.getState().recordUnknownSubmission('b'.repeat(64), { ...review, requestId: 'other' }));
  await act(async () => resolve('confirmed'));
  expect(ui.getByText('Payment Status Unknown')).toBeTruthy();
});
