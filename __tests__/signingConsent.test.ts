/** Focused regression: signing consent must reflect what current wallet can sign. */
import { validateSigningConsent } from '../src/features/payments/signingConsent';

const source = 'GALSUPKQMN3ITHFPYLK6R6YOEE2EOWTNQCJ2NOOM37ZAKGBLHZIWIBGS';
const destination = 'GAUTYT3COWEJXLWB2TT7UDJAGNDFS3D7SKS3RS666ECBOKR5KBRXNA3O';
const route = {
  source,
  destination,
  amount: '3.0000000',
  assetCode: 'XLM',
  memo: 'Approved payment',
  network: 'Testnet',
  fee: '100',
};
const wallet = { publicKey: source, balance: '20.0000000' };

describe('signing confirmation route identity (#388)', () => {
  const originalNetwork = process.env.EXPO_PUBLIC_STELLAR_NETWORK;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_STELLAR_NETWORK = 'TESTNET';
  });
  afterAll(() => {
    if (originalNetwork === undefined) delete process.env.EXPO_PUBLIC_STELLAR_NETWORK;
    else process.env.EXPO_PUBLIC_STELLAR_NETWORK = originalNetwork;
  });

  it('accepts only the current wallet native-XLM request, never a supplied fee', () => {
    const result = validateSigningConsent(route, wallet);
    expect(result.ok).toBe(true);
    expect(result.values).toEqual({
      source, destination, amount: '3.0000000', assetCode: 'XLM',
      memo: 'Approved payment', network: 'Testnet',
    });
    expect(result.values).not.toHaveProperty('fee');
  });

  it('rejects a changed signer and a spoofed route sender', () => {
    expect(validateSigningConsent(route, { ...wallet, publicKey: destination }).ok).toBe(false);
    expect(validateSigningConsent({ ...route, source: destination }, wallet).ok).toBe(false);
  });

  it('rejects a fake network or issued asset before navigation', () => {
    expect(validateSigningConsent({ ...route, network: 'Public Network' }, wallet).ok).toBe(false);
    expect(validateSigningConsent({ ...route, assetCode: 'USDC' }, wallet).ok).toBe(false);
    process.env.EXPO_PUBLIC_STELLAR_NETWORK = 'PUBLIC';
    expect(validateSigningConsent(route, wallet).ok).toBe(false);
  });

  it('rejects repeated/invalid route values and over-limit payment fields', () => {
    expect(validateSigningConsent({ ...route, source: [source] }, wallet).ok).toBe(false);
    expect(validateSigningConsent({ ...route, destination: source }, wallet).ok).toBe(false);
    expect(validateSigningConsent({ ...route, amount: '-1' }, wallet).ok).toBe(false);
    expect(validateSigningConsent({ ...route, amount: '30' }, wallet).ok).toBe(false);
    expect(validateSigningConsent({ ...route, memo: 'x'.repeat(29) }, wallet).ok).toBe(false);
    expect(validateSigningConsent({ ...route, memo: ['hello'] }, wallet).ok).toBe(false);
    expect(validateSigningConsent(route, { ...wallet, balance: 'unknown' }).ok).toBe(false);
  });
});
