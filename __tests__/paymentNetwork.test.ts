import { Networks } from '@stellar/stellar-sdk';
import { getPaymentNetworkInfo } from '../src/utils/paymentNetwork';

describe('payment network disclosure', () => {
  it('labels configured Testnet and explains test assets', () => {
    const info = getPaymentNetworkInfo({
      network: 'TESTNET',
      passphrase: Networks.TESTNET,
    });
    expect(info.kind).toBe('testnet');
    expect(info.label).toBe('Testnet');
    expect(info.mismatch).toBe(false);
    expect(info.warning).toMatch(/test assets/i);
  });

  it('labels mainnet from the actual signing passphrase', () => {
    const info = getPaymentNetworkInfo({
      network: 'PUBLIC',
      passphrase: Networks.PUBLIC,
    });
    expect(info.kind).toBe('mainnet');
    expect(info.label).toMatch(/Mainnet/);
    expect(info.warning).toMatch(/real assets/i);
  });

  it('does not expose a custom passphrase in UI copy', () => {
    const passphrase = 'Internal custom signing network phrase';
    const info = getPaymentNetworkInfo({ network: 'CUSTOM', passphrase });
    expect(info.kind).toBe('custom');
    expect(info.mismatch).toBe(false);
    expect(info.warning).toMatch(/Custom signing network/);
    expect(JSON.stringify(info)).not.toContain(passphrase);
  });

  it('reports alias/signing mismatches without mislabelling funds', () => {
    const info = getPaymentNetworkInfo({
      network: 'MAINNET',
      passphrase: Networks.TESTNET,
    });
    expect(info.label).toBe('Testnet');
    expect(info.mismatch).toBe(true);
    expect(info.warning).toMatch(/disagree/i);
  });

  it('uses the signer Testnet default for an empty passphrase', () => {
    const info = getPaymentNetworkInfo({ network: 'MAINNET', passphrase: '' });
    expect(info.kind).toBe('testnet');
    expect(info.mismatch).toBe(true);
  });
});
