import { validateAmount, validatePaymentSend } from '../validation';

const sender = 'G' + 'A'.repeat(55);
const destination = 'G' + 'B'.repeat(55);
const good = { destination, amount: '2.5000000', memo: 'invoice' };
const ready = {
  sourcePublicKey: sender,
  balance: '10.0000000',
  balanceState: 'available' as const,
  fundingStatus: 'funded' as const,
  networkState: 'online' as const,
};

describe('payment send validation (#520)', () => {
  it('accepts a ready payment and a 28-byte memo', () => {
    expect(validatePaymentSend({ ...good, memo: 'a'.repeat(28) }, ready))
      .toEqual({ destination: undefined, amount: undefined, memo: undefined });
  });

  it('rejects bad recipient, self-payment, amount, and excess UTF-8 memo bytes', () => {
    expect(validatePaymentSend({ ...good, destination: 'not-a-wallet' }, ready).destination).toBeTruthy();
    expect(validatePaymentSend({ ...good, destination: sender }, ready).destination).toBeTruthy();
    expect(validatePaymentSend({ ...good, amount: '0' }, ready).amount).toBeTruthy();
    expect(validatePaymentSend({ ...good, amount: '9.5' }, ready).amount).toBeTruthy();
    expect(validatePaymentSend({ ...good, memo: '💸'.repeat(8) }, ready).memo).toBeTruthy();
    expect(validatePaymentSend({ ...good, amount: '1.12345678' }, ready).amount).toBeTruthy();
  });

  it.each(['NaN', 'Infinity', '', '-1', 'broken'] as const)(
    'rejects an invalid fetched wallet balance (%s)', (balance) => {
      expect(validateAmount('1', balance)).toMatch(/balance is unavailable/i);
      expect(validatePaymentSend(good, { ...ready, balance }).amount).toBeTruthy();
    },
  );

  it('stops navigation when the wallet is not ready or account not funded', () => {
    expect(validatePaymentSend(good, { ...ready, sourcePublicKey: null }).readiness).toMatch(/Connect/i);
    expect(validatePaymentSend(good, { ...ready, fundingStatus: 'unfunded' }).readiness).toMatch(/Fund/i);
    expect(validatePaymentSend(good, { ...ready, fundingStatus: 'checking' }).readiness).toMatch(/not ready/i);
    expect(validatePaymentSend(good, { ...ready, balanceState: 'loading' }).readiness).toMatch(/not ready/i);
    expect(validatePaymentSend(good, { ...ready, balanceState: 'unavailable' }).readiness).toMatch(/not ready/i);
  });

  it.each(['offline', 'wrong-network', 'service-unavailable', 'degraded', 'unknown'] as const)(
    'blocks send on %s network', (networkState) => {
      expect(validatePaymentSend(good, { ...ready, networkState }).readiness).toMatch(/Network/i);
    },
  );
});
