/**
 * Focused acceptance checks for issue #321: never confuse Horizon transport
 * uncertainty with a definitive rejection or safe permission to resubmit.
 */
jest.mock('expo-crypto', () => ({ getRandomValues: jest.fn() }));
jest.mock('@stellar/stellar-sdk', () => {
  const transaction = {
    sign: jest.fn(),
    hash: jest.fn(() => require('buffer').Buffer.from('ab'.repeat(32), 'hex')),
  };
  const builder = {
    addOperation: jest.fn().mockReturnThis(),
    addMemo: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn(() => transaction),
  };
  return {
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn(),
        fetchBaseFee: jest.fn(),
        submitTransaction: jest.fn(),
        transactions: jest.fn(),
      })),
    },
    Keypair: { fromSecret: jest.fn(() => ({ publicKey: () => 'GPUBLIC' })) },
    TransactionBuilder: jest.fn(() => builder),
    Operation: { payment: jest.fn(() => ({})) },
    Asset: { native: jest.fn(() => ({})) },
    Memo: { text: jest.fn(() => ({})) },
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
  };
});

import {
  server,
  sendXlmTransaction,
  checkSubmittedTransaction,
  TransactionPreparationError,
  TransactionSubmissionRejectedError,
  TransactionSubmissionUnknownError,
} from '../src/services/stellar';

const horizon = server as unknown as {
  loadAccount: jest.Mock;
  fetchBaseFee: jest.Mock;
  submitTransaction: jest.Mock;
  transactions: jest.Mock;
};
const HASH = 'ab'.repeat(32);

beforeEach(() => {
  jest.clearAllMocks();
  horizon.loadAccount.mockResolvedValue({ accountId: () => 'GPUBLIC' });
  horizon.fetchBaseFee.mockResolvedValue(100);
  horizon.submitTransaction.mockReset();
});

describe('sendXlmTransaction submission certainty', () => {
  it('retains deterministic signed hash after network timeout, without retry', async () => {
    horizon.submitTransaction.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(sendXlmTransaction('SSECRET', 'GDEST', '5')).rejects.toMatchObject({
      name: 'TransactionSubmissionUnknownError',
      hash: HASH,
    });
    expect(horizon.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('uses typed rejection for an explicit Horizon transaction code', async () => {
    horizon.submitTransaction.mockRejectedValueOnce({
      response: { data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } },
    });
    await expect(sendXlmTransaction('SSECRET', 'GDEST', '5')).rejects.toMatchObject({
      name: 'TransactionSubmissionRejectedError',
      resultCode: 'tx_bad_seq',
    });
    expect(horizon.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('never submits when preparation fails', async () => {
    horizon.loadAccount.mockRejectedValueOnce(new Error('Cannot load account'));
    await expect(sendXlmTransaction('SSECRET', 'GDEST', '5')).rejects.toBeInstanceOf(
      TransactionPreparationError
    );
    expect(horizon.submitTransaction).not.toHaveBeenCalled();
  });
});

describe('checkSubmittedTransaction', () => {
  it('confirms only the exact original public hash', async () => {
    const call = jest.fn().mockResolvedValue({ successful: true });
    const transaction = jest.fn(() => ({ call }));
    horizon.transactions.mockReturnValue({ transaction });
    await expect(checkSubmittedTransaction(HASH)).resolves.toBe('confirmed');
    expect(transaction).toHaveBeenCalledWith(HASH);
    expect(horizon.submitTransaction).not.toHaveBeenCalled();
  });

  it('does not treat Horizon 404 as definitive failure', async () => {
    horizon.transactions.mockReturnValue({
      transaction: jest.fn(() => ({
        call: jest.fn().mockRejectedValue({ response: { status: 404 } }),
      })),
    });
    await expect(checkSubmittedTransaction(HASH)).resolves.toBe('not_found');
    expect(horizon.submitTransaction).not.toHaveBeenCalled();
  });

  it('rejects an untrusted malformed transaction hash before making a query', async () => {
    await expect(checkSubmittedTransaction('not-a-hash')).rejects.toThrow('Invalid public transaction hash');
    expect(horizon.transactions).not.toHaveBeenCalled();
  });
});
