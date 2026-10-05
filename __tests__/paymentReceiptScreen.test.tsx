import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PaymentReceiptScreen from '../app/payment-receipt';
import { RECEIPT_COPY, RECEIPT_STATUSES } from '../src/features/transactions/receipt';

let mockParams: Record<string, unknown>;
const mockReplace = jest.fn();
const mockCopy = jest.fn();
const mockExplorer = jest.fn((hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('../src/services/stellar', () => ({ getExplorerTxUrl: (hash: string) => mockExplorer(hash) }));
jest.mock('../src/store/appStore', () => ({
  useAppStore: (select: (state: { contacts: unknown[] }) => unknown) => select({ contacts: [] }),
}));
jest.mock('../src/utils/contacts', () => ({ resolveAddressLabel: () => ({ isContact: false }) }));
jest.mock('../src/utils/clipboard', () => ({
  useCopyToClipboard: () => ({ copy: mockCopy, copiedField: null }),
}));
jest.mock('lucide-react-native', () => ({
  CheckCircle: () => null, Copy: () => null, Check: () => null,
  ExternalLink: () => null, Clock: () => null, XCircle: () => null, AlertCircle: () => null,
}));

const originalNetwork = process.env.EXPO_PUBLIC_STELLAR_NETWORK;
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const canOpenSpy = jest.spyOn(Linking, 'canOpenURL');
const openSpy = jest.spyOn(Linking, 'openURL');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_STELLAR_NETWORK = 'TESTNET';
  mockParams = {
    status: 'successful', hash: 'a'.repeat(64), amount: '12.5000000', asset: 'XLM',
    destination: 'G'.padEnd(56, 'A'), date: '2026-10-04T12:00:00Z', network: 'TESTNET',
  };
  mockCopy.mockResolvedValue({ ok: true });
  canOpenSpy.mockResolvedValue(true);
  openSpy.mockResolvedValue(undefined);
});

afterAll(() => {
  if (originalNetwork === undefined) delete process.env.EXPO_PUBLIC_STELLAR_NETWORK;
  else process.env.EXPO_PUBLIC_STELLAR_NETWORK = originalNetwork;
  jest.restoreAllMocks();
});

it.each(RECEIPT_STATUSES)('renders the %s outcome with transaction details', (status) => {
  mockParams.status = status;
  const screen = render(<PaymentReceiptScreen />);
  expect(screen.getByTestId('receipt-status').props.children).toBe(RECEIPT_COPY[status].label);
  expect(screen.getByText(RECEIPT_COPY[status].description)).toBeTruthy();
  expect(screen.getByText('12.5 XLM')).toBeTruthy();
  expect(screen.getByText(mockParams.destination as string)).toBeTruthy();
  expect(screen.getByText(mockParams.hash as string)).toBeTruthy();
});

it('does not infer confirmation from the legacy success route or missing fields', () => {
  mockParams = {};
  const screen = render(<PaymentReceiptScreen />);
  expect(screen.getByText('Outcome Unknown')).toBeTruthy();
  expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  expect(screen.queryByText('Payment Confirmed')).toBeNull();
  expect(screen.queryByLabelText('View transaction on Stellar Expert')).toBeNull();
});

it('hides a mismatched-network explorer and handles a device link failure', async () => {
  mockParams.network = 'PUBLIC';
  const screen = render(<PaymentReceiptScreen />);
  expect(screen.queryByLabelText('View transaction on Stellar Expert')).toBeNull();
  expect(mockExplorer).not.toHaveBeenCalled();
  mockParams.network = 'TESTNET';
  screen.rerender(<PaymentReceiptScreen />);
  openSpy.mockRejectedValueOnce(new Error('no browser'));
  fireEvent.press(screen.getByLabelText('View transaction on Stellar Expert'));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Explorer Unavailable', expect.any(String)));
});

it('reports copy failure and preserves wallet and activity navigation', async () => {
  mockCopy.mockResolvedValueOnce({ ok: false });
  const screen = render(<PaymentReceiptScreen />);
  fireEvent.press(screen.getByLabelText('Copy transaction hash'));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Copy Failed', expect.any(String)));
  fireEvent.press(screen.getByText('View Activity'));
  expect(mockReplace).toHaveBeenLastCalledWith('/(tabs)/history');
  fireEvent.press(screen.getByText('Back to Wallet'));
  expect(mockReplace).toHaveBeenLastCalledWith('/(tabs)');
});
