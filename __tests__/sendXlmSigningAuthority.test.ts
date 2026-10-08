/** A signer/consent mismatch must never reach Horizon POST (#387). */
jest.mock('@stellar/stellar-sdk', () => {
  // The mock factory is fully self-contained so Babel Jest hoisting cannot
  // reference a not-yet-initialized outer variable.
  const live = {
    loadAccount: jest.fn(async () => ({ sequence: '10', balances: [] })),
    fetchBaseFee: jest.fn(async () => 100),
    submitTransaction: jest.fn(async () => ({ hash: 'network-confirmed' })),
  };
  const mockTransaction = {
    sign: jest.fn(),
    hash: jest.fn(() => ({ toString: () => 'aabbccdd' })),
  };
  const builder = {
    addOperation: jest.fn().mockReturnThis(),
    addMemo: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn(() => mockTransaction),
  };
  return {
    __esModule: true,
    Horizon: { Server: jest.fn(() => live) },
    Keypair: {
      fromSecret: jest.fn(() => ({
        publicKey: () => 'GACTUAL_SIGNER',
        sign: jest.fn(),
      })),
      random: jest.fn(),
    },
    TransactionBuilder: jest.fn(() => builder),
    Operation: { payment: jest.fn(() => ({})) },
    Asset: { native: jest.fn(() => ({})) },
    Memo: { text: jest.fn((value: string) => ({ value })) },
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    __test: { live, mockTransaction },
  };
});

jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn((bytes: Uint8Array) => bytes),
}));

import * as StellarSdk from '@stellar/stellar-sdk';
import { sendXlmTransaction } from '../src/services/stellar';
const { live, mockTransaction } = (StellarSdk as any).__test;

beforeEach(() => {
  jest.clearAllMocks();
  live.loadAccount.mockResolvedValue({ sequence: '10', balances: [] });
  live.fetchBaseFee.mockResolvedValue(100);
  live.submitTransaction.mockResolvedValue({ hash: 'network-confirmed' });
});

describe('signer identity and pre-submit cancellation boundaries', () => {
  it('rejects secret keys from a different wallet BEFORE loading account, signing or submitting', async () => {
    await expect(sendXlmTransaction('S_OTHER', 'G_DEST', '1', undefined, undefined, 'G_REVIEWED'))
      .rejects.toMatchObject({
        name: 'PaymentSendError',
        submissionAttempted: false,
        definitiveRejection: false,
        transactionHash: null,
      });
    expect(live.loadAccount).not.toHaveBeenCalled();
    expect(mockTransaction.sign).not.toHaveBeenCalled();
    expect(live.submitTransaction).not.toHaveBeenCalled();
  });

  it('aborts a stale or cancelled review after signing but before network submission', async () => {
    const callback = jest.fn(() => false);
    await expect(sendXlmTransaction('S_CORRECT', 'G_DEST', '1', undefined, callback, 'GACTUAL_SIGNER'))
      .rejects.toMatchObject({
        name: 'PaymentSendError',
        submissionAttempted: false,
        transactionHash: null,
      });
    expect(callback).toHaveBeenCalledWith('aabbccdd');
    expect(mockTransaction.sign).toHaveBeenCalledTimes(1);
    expect(live.submitTransaction).not.toHaveBeenCalled();
  });

  it('submits once when the actual signer and review identity match at the last boundary', async () => {
    const callback = jest.fn(() => true);
    await expect(sendXlmTransaction('S_CORRECT', 'G_DEST', '1', undefined, callback, 'GACTUAL_SIGNER'))
      .resolves.toMatchObject({ hash: 'network-confirmed' });
    expect(callback).toHaveBeenCalledWith('aabbccdd');
    expect(live.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('retains existing caller compatibility when the optional gate is not provided', async () => {
    const callback = jest.fn(() => undefined);
    await expect(sendXlmTransaction('S_CORRECT', 'G_DEST', '1', undefined, callback))
      .resolves.toMatchObject({ hash: 'network-confirmed' });
    expect(live.submitTransaction).toHaveBeenCalledTimes(1);
  });
});
