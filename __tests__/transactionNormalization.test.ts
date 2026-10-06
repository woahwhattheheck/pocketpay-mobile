import {
  matchesTransactionFilter,
  normalizeTransactionRecord,
} from '../src/features/transactions/normalization';

const OWNER = 'GOWNER';
const PEER = 'GPEER';

describe('transaction history normalisation', () => {
  it('normalises a Horizon native payment into a canonical sent record', () => {
    const tx = normalizeTransactionRecord(
      {
        id: '101',
        type: 'payment',
        from: OWNER,
        to: PEER,
        amount: '12.5000000',
        asset_type: 'native',
        created_at: '2026-10-06T12:00:00Z',
        transaction_hash: 'hash-101',
        transaction_successful: true,
      },
      OWNER,
    );

    expect(tx).toMatchObject({
      id: '101',
      direction: 'sent',
      status: 'confirmed',
      activityKind: 'payment',
      asset: 'XLM',
      hash: 'hash-101',
      createdAt: '2026-10-06T12:00:00Z',
    });
  });

  it('maps alternate Horizon account fields into the same receive model', () => {
    const tx = normalizeTransactionRecord(
      {
        id: '102',
        type: 'create_account',
        funder: PEER,
        account: OWNER,
        starting_balance: '5.0000000',
        created_at: '2026-10-06T12:01:00Z',
        transaction_successful: true,
      },
      OWNER,
    );

    expect(tx.from).toBe(PEER);
    expect(tx.to).toBe(OWNER);
    expect(tx.amount).toBe('5.0000000');
    expect(tx.direction).toBe('received');
    expect(matchesTransactionFilter(tx, 'received')).toBe(true);
  });

  it('keeps optimistic and vault activity first-class without guessing success', () => {
    const pending = normalizeTransactionRecord(
      {
        id: 'local-1',
        type: 'payment',
        from: OWNER,
        to: PEER,
        hash: 'local-hash',
        status: 'pending',
      },
      OWNER,
    );
    const vault = normalizeTransactionRecord(
      {
        id: 'vault-1',
        type: 'invoke_host_function',
        source_account: OWNER,
      },
      OWNER,
    );

    expect(pending.status).toBe('pending');
    expect(matchesTransactionFilter(pending, 'pending')).toBe(true);
    expect(vault.activityKind).toBe('vault');
    expect(vault.status).toBe('unknown');
    expect(matchesTransactionFilter(vault, 'vault')).toBe(true);
    expect(matchesTransactionFilter(vault, 'unknown')).toBe(true);
  });

  it('represents malformed or incomplete activity as unknown instead of confirmed', () => {
    const tx = normalizeTransactionRecord({ id: 'mystery', type: 'unknown' }, OWNER);

    expect(tx.direction).toBe('unknown');
    expect(tx.status).toBe('unknown');
    expect(matchesTransactionFilter(tx, 'unknown')).toBe(true);
  });
});
