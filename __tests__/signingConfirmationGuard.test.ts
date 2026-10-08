import { validateSigningConfirmationRequest } from '../src/utils/signingConfirmation';

jest.mock('pocketpay-sdk', () => ({
  validatePublicKey: (key: string) => {
    if (!/^G[A-Z2-7]{55}$/.test(key)) throw new Error('Invalid Stellar key');
    return true;
  },
}));

const source = 'G' + 'A'.repeat(55);
const destination = 'G' + 'B'.repeat(55);
const wallet = { publicKey: source, balance: '100', network: 'Testnet' };
const request = {
  source,
  destination,
  amount: '12.3456789',
  assetCode: 'XLM',
  memo: 'invoice-123',
  network: 'Testnet',
  fee: '1',
};

describe('signing confirmation route uses the live signer, not URL claims (#388)', () => {
  it('accepts a valid payment and only forwards normalized, verified values', () => {
    expect(validateSigningConfirmationRequest(request, wallet)).toEqual({
      ok: true,
      values: { source, destination, amount: request.amount, assetCode: 'XLM', memo: request.memo, network: 'Testnet' },
    });
  });

  it('blocks missing or switched wallets, and forged asset/network values', () => {
    expect(validateSigningConfirmationRequest(request, { ...wallet, publicKey: null }).ok).toBe(false);
    expect(validateSigningConfirmationRequest(request, { ...wallet, publicKey: 'G' + 'C'.repeat(55) }).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, source: [source, source] }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, network: 'Public Network' }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, assetCode: 'USD' }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, assetCode: undefined }, wallet).ok).toBe(false);
  });

  it('blocks malformed addresses, over-precision, negative or unspendable amounts and oversized memos', () => {
    expect(validateSigningConfirmationRequest({ ...request, destination: 'not-an-address' }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, amount: '1.00000001' }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, amount: '-1' }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, amount: '99.1' }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, memo: 'x'.repeat(29) }, wallet).ok).toBe(false);
  });

  it('rejects malformed or unavailable live spendable balances before signing consent', () => {
    for (const balance of ['NaN', 'Infinity', '-1', '99abc', '', ' ', '100.00000000', '0.000000001']) {
      expect(validateSigningConfirmationRequest(request, { ...wallet, balance }).ok).toBe(false);
    }
    expect(validateSigningConfirmationRequest(request, { ...wallet, balance: undefined as unknown as string }).ok).toBe(false);
    expect(validateSigningConfirmationRequest(request, { ...wallet, balance: '12' }).ok).toBe(false);
    expect(validateSigningConfirmationRequest(request, { ...wallet, balance: '13.3456789' }).ok).toBe(true);
  });

  it('rejects unsupported active network values even if the route repeats them', () => {
    for (const label of ['FUTURENET', 'UNSUPPORTED', 'https://fake.stellar.invalid', '']) {
      expect(validateSigningConfirmationRequest({ ...request, network: label }, { ...wallet, network: label }).ok).toBe(false);
    }
    const liveMainnet = { ...wallet, network: 'Public Network' };
    expect(validateSigningConfirmationRequest({ ...request, network: 'Public Network' }, liveMainnet).ok).toBe(true);
  });

  it('rejects invalid signer identity even when the route source matches the stale wallet', () => {
    const invalid = 'not-a-stellar-address';
    expect(validateSigningConfirmationRequest({ ...request, source: invalid }, { ...wallet, publicKey: invalid }).ok).toBe(false);
  });

  it('rejects query-array injection but treats a missing optional memo as empty', () => {
    expect(validateSigningConfirmationRequest({ ...request, destination: [destination] }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, memo: ['one', 'two'] }, wallet).ok).toBe(false);
    expect(validateSigningConfirmationRequest({ ...request, memo: undefined }, wallet)).toMatchObject({
      ok: true, values: { memo: '' },
    });
  });
});
