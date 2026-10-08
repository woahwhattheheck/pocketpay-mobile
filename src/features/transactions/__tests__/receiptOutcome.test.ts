import {
  buildTypedReceipt, normalizeReceiptOutcome, RECEIPT_OUTCOME_COPY,
} from '../receipt';

describe('typed transaction receipt (#522)', () => {
  it('covers all five network outcomes without assuming unknown means confirmed', () => {
    const outcomes = ['success', 'pending', 'failed', 'rejected', 'unknown'] as const;
    for (const outcome of outcomes) {
      expect(normalizeReceiptOutcome(outcome)).toBe(outcome);
      const receipt = buildTypedReceipt({ outcome });
      expect(receipt.outcome).toBe(outcome);
      expect(receipt.outcomeCopy.title).toBe(RECEIPT_OUTCOME_COPY[outcome].title);
      expect(receipt.outcomeCopy.description).toBeTruthy();
    }
    expect(normalizeReceiptOutcome(undefined)).toBe('unknown');
    expect(normalizeReceiptOutcome('TIMEOUT')).toBe('unknown');
    expect(normalizeReceiptOutcome('submitted')).toBe('pending');
    expect(normalizeReceiptOutcome('cancelled')).toBe('rejected');
  });

  it('shows all public fields when present and omits malformed hash/explorer links', () => {
    const hash = 'a'.repeat(64);
    const receipt = buildTypedReceipt({
      outcome: 'confirmed', amount: '12.3456789', asset: 'usdc',
      destination: 'G' + 'A'.repeat(55), date: '2026-10-08T00:00:00Z',
      hash, explorerUrl: 'https://stellar.expert/explorer/testnet/tx/' + hash,
    });
    expect(receipt.displayValue).toContain('USDC');
    expect(receipt.displayDestination).toContain('G');
    expect(receipt.displayDate).not.toBe('—');
    expect(receipt.canCopyHash).toBe(true);
    expect(receipt.hasExplorerLink).toBe(true);
    const unknown = buildTypedReceipt({
      amount: 'oops', hash: 'secret-key-not-a-hash', explorerUrl: 'https://example.com',
    });
    expect(unknown.outcome).toBe('unknown');
    expect(unknown.displayValue).toBe('—');
    expect(unknown.canCopyHash).toBe(false);
    expect(unknown.hasExplorerLink).toBe(false);
  });
});
