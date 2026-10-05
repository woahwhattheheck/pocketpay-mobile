import {
  describeSdkError,
  mapSdkError,
} from '../src/utils/sdkErrorMapper';
import { classifyPaymentError } from '../src/utils/paymentErrors';
import { classifyVaultError, describeVaultError } from '../src/utils/vaultErrors';
import { classifyWalletStorageError } from '../src/utils/walletStorageErrors';

describe('shared SDK error mapper', () => {
  it('maps Horizon payment codes to actionable user guidance', () => {
    const mapped = mapSdkError(new Error('op_underfunded'), 'payment');

    expect(mapped.category).toBe('insufficient-balance');
    expect(mapped.title).toBe('Insufficient Balance');
    expect(mapped.recoveryAction).toBe('fund-wallet');
    expect(mapped.canRetry).toBe(false);
    expect(mapped.diagnosticCode).toBe('SDK-PAYMENT-INSUFFICIENT_BALANCE');
  });

  it('covers transaction errors independently from payment errors', () => {
    const mapped = mapSdkError(new Error('tx_bad_seq'), 'transaction');

    expect(mapped.domain).toBe('transaction');
    expect(mapped.category).toBe('sequence');
    expect(mapped.recoveryAction).toBe('refresh');
    expect(mapped.diagnosticCode).toBe('SDK-TRANSACTION-SEQUENCE');
  });

  it('makes an unknown transaction non-retryable and directs history checking', () => {
    const mapped = mapSdkError(new Error('socket closed after submit'), 'transaction');

    expect(mapped.category).toBe('unknown');
    expect(mapped.title).toBe('Transaction Status Unknown');
    expect(mapped.recoveryAction).toBe('check-history');
    expect(mapped.canRetry).toBe(false);
    expect(mapped.action).toMatch(/history/i);
  });

  it('maps wallet storage/provider failures without exposing raw details', () => {
    const secret = `S${'A'.repeat(55)}`;
    const mapped = classifyWalletStorageError(
      new Error(`SecureStore could not read wallet secret ${secret}`)
    );

    expect(mapped.domain).toBe('wallet');
    expect(mapped.category).toBe('wallet-storage');
    expect(mapped.message).not.toContain(secret);
    expect(mapped.action).not.toContain(secret);
    expect(mapped.diagnosticCode).toBe('SDK-WALLET-WALLET_STORAGE');
  });

  it('returns a generic safe fallback instead of arbitrary thrown text', () => {
    const sensitive = 'rpc failed at https://private.example/token=abc123';
    const mapped = mapSdkError(new Error(sensitive), 'payment');

    expect(mapped.category).toBe('unknown');
    expect(mapped.message).toBe('PocketPay could not complete this action safely.');
    expect(JSON.stringify(mapped)).not.toContain('private.example');
    expect(JSON.stringify(mapped)).not.toContain('abc123');
  });

  it('preserves the existing payment compatibility surface', () => {
    const guidance = classifyPaymentError(new Error('op_no_destination'));

    expect(guidance.title).toBe('Recipient Not Found');
    expect(guidance.canRetry).toBe(false);
    expect(guidance.diagnosticCode).toBe('SDK-PAYMENT-DESTINATION_NOT_FOUND');
  });

  it('preserves vault known-code and thrown-error compatibility surfaces', () => {
    const known = describeVaultError('not-matured');
    const thrown = classifyVaultError(new Error('simulation failed for contract CSECRET'));

    expect(known.title).toBe('Lock Not Ready');
    expect(known.diagnosticCode).toBe('SDK-VAULT-NOT_MATURED');
    expect(thrown.category).toBeUndefined();
    expect(thrown.title).toBe('Contract Error');
    expect(thrown.message).not.toContain('CSECRET');
    expect(thrown.diagnosticCode).toBe('SDK-VAULT-CONTRACT');
  });

  it('can describe a canonical category without parsing raw SDK text', () => {
    const mapped = describeSdkError('vault', 'unsupported');

    expect(mapped.title).toBe('Feature Unavailable');
    expect(mapped.recoveryAction).toBe('open-settings');
    expect(mapped.diagnosticCode).toBe('SDK-VAULT-UNSUPPORTED');
  });
});
