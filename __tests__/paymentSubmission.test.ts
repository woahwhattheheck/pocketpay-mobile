jest.mock('expo-crypto', () => ({ getRandomValues: jest.fn() }));
jest.mock('@stellar/stellar-sdk', () => {
  const transaction = { sign: jest.fn(), hash: jest.fn() };
  const server = {
    loadAccount: jest.fn(), fetchBaseFee: jest.fn(), checkMemoRequired: jest.fn(),
    submitTransaction: jest.fn(), transactions: jest.fn(),
  };
  return {
    __testTransaction: transaction,
    Keypair: { fromSecret: jest.fn(() => ({ publicKey: () => 'GSOURCE' })) },
    Horizon: { Server: jest.fn(() => server) },
    Networks: { TESTNET: 'Testnet' },
    TransactionBuilder: jest.fn(() => ({
      addOperation: jest.fn(), addMemo: jest.fn(), setTimeout: jest.fn(),
      build: () => transaction,
    })),
    Operation: { payment: jest.fn() }, Asset: { native: jest.fn() }, Memo: { text: jest.fn() },
  };
});

import * as SDK from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { server, sendXlmTransaction, fetchPaymentSubmissionStatus } from '../src/services/stellar';
import { UnknownPaymentSubmissionError } from '../src/features/payments/submissionOutcome';

const hash = 'a'.repeat(64);
const mockServer = server as any;
const transaction = (SDK as any).__testTransaction;
const lookup = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockServer.loadAccount.mockResolvedValue({ sequence: '1' });
  mockServer.fetchBaseFee.mockResolvedValue(100);
  mockServer.checkMemoRequired.mockResolvedValue(undefined);
  mockServer.submitTransaction.mockResolvedValue({ hash, successful: true });
  transaction.hash.mockReturnValue(Buffer.from(hash, 'hex'));
  lookup.mockReset();
  mockServer.transactions.mockReturnValue({ transaction: jest.fn(() => ({ call: lookup })) });
});

describe('submission boundary', () => {
  it('checks memo requirements once before broadcasting and preserves success', async () => {
    await expect(sendXlmTransaction('DUMMY_SECRET', 'GDEST', '1')).resolves.toEqual({ hash, successful: true });
    expect(mockServer.checkMemoRequired).toHaveBeenCalledTimes(1);
    expect(mockServer.submitTransaction).toHaveBeenCalledWith(transaction, { skipMemoRequiredCheck: true });
    expect(mockServer.checkMemoRequired.mock.invocationCallOrder[0]).toBeLessThan(mockServer.submitTransaction.mock.invocationCallOrder[0]);
  });

  it('keeps memo-required preflight rejection out of unknown submission', async () => {
    mockServer.checkMemoRequired.mockRejectedValueOnce(new Error('account requires a memo'));
    await expect(sendXlmTransaction('DUMMY_SECRET', 'GDEST', '1')).rejects.toThrow('could not be submitted');
    expect(mockServer.submitTransaction).not.toHaveBeenCalled();
  });

  it('does not broadcast when account loading fails', async () => {
    mockServer.loadAccount.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(sendXlmTransaction('DUMMY_SECRET', 'GDEST', '1')).rejects.not.toBeInstanceOf(UnknownPaymentSubmissionError);
    expect(mockServer.submitTransaction).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'AbortError', 'network disconnected'])('preserves hash after a lost %s response without resubmitting', async (message) => {
    mockServer.submitTransaction.mockRejectedValueOnce(new Error(message));
    await expect(sendXlmTransaction('DUMMY_SECRET', 'GDEST', '1')).rejects.toMatchObject({
      name: 'UnknownPaymentSubmissionError', transactionHash: hash,
    });
    expect(mockServer.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an explicit Horizon rejection from uncertainty', async () => {
    mockServer.submitTransaction.mockRejectedValueOnce({ response: { status: 400, data: { extras: { result_codes: { transaction: 'tx_failed' } } } } });
    await expect(sendXlmTransaction('DUMMY_SECRET', 'GDEST', '1')).rejects.toThrow('tx_failed');
    expect(mockServer.submitTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('read-only status lookup', () => {
  it.each([[true, 'confirmed'], [false, 'failed'], [undefined, 'unknown']])('uses only the definitive successful=%s result', async (successful, expected) => {
    lookup.mockResolvedValueOnce({ hash, successful });
    await expect(fetchPaymentSubmissionStatus(hash)).resolves.toBe(expected);
    expect(mockServer.submitTransaction).not.toHaveBeenCalled();
  });

  it('retains unknown after a 404', async () => {
    lookup.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(fetchPaymentSubmissionStatus(hash)).resolves.toBe('unknown');
  });

  it('never resolves a different hash as this payment', async () => {
    lookup.mockResolvedValueOnce({ hash: 'b'.repeat(64), successful: true });
    await expect(fetchPaymentSubmissionStatus(hash)).rejects.toThrow('Could not check');
  });

  it('rejects malformed hashes before sending a lookup', async () => {
    await expect(fetchPaymentSubmissionStatus('not-a-hash')).rejects.toThrow('valid transaction hash');
    expect(mockServer.transactions).not.toHaveBeenCalled();
  });
});
