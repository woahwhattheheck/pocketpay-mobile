import { strict as assert } from 'node:assert';
import {
  canOpenReceiptExplorer,
  createReceiptParams,
  formatReceiptAmount,
  readReceiptParams,
  RECEIPT_STATUSES,
  resolveReceiptStatus,
  resolveReceiptAsset,
} from '../src/features/transactions/receipt';

const publicReceipt = {
  status: 'successful', hash: 'a'.repeat(64), amount: '12.5000000', asset: 'XLM',
  destination: 'G'.padEnd(56, 'A'), date: '2026-10-04T12:00:00Z', network: 'TESTNET',
};

describe('payment receipt model', () => {
  it('represents five outcomes and never treats missing evidence as success', () => {
    for (const status of RECEIPT_STATUSES) {
      assert.equal(resolveReceiptStatus({ status }), status);
    }
    assert.equal(resolveReceiptStatus({}), 'unknown');
    assert.equal(resolveReceiptStatus({ status: 'confirmed-ish' }), 'unknown');
    assert.equal(resolveReceiptStatus({ status: ['successful'] }), 'unknown');
    assert.equal(resolveReceiptStatus({ transaction_successful: true }), 'successful');
    assert.equal(resolveReceiptStatus({ transaction_successful: false, status: 'successful' }), 'failed');
    assert.equal(resolveReceiptStatus({ is_pending: true, transaction_successful: true }), 'pending');
  });

  it('serializes public fields only and rejects malformed or repeated route values', () => {
    const input = { ...publicReceipt, secretKey: 'S'.repeat(56), error: { raw: 'private' } };
    assert.deepEqual(createReceiptParams(input), publicReceipt);
    const malformed = readReceiptParams({
      status: ['successful'], hash: '../../account', amount: '-1', asset: ['XLM'],
      destination: 'S'.repeat(56), date: 'not-a-date', network: ['TESTNET'],
    });
    assert.deepEqual(malformed, {
      status: 'unknown', hash: '', amount: '', asset: '', destination: '', date: '', network: '',
    });
    assert.equal(readReceiptParams({ amount: '1.00000001' }).amount, '');
    assert.equal(readReceiptParams({ hash: 'A'.repeat(64) }).hash, 'a'.repeat(64));
  });

  it('preserves monetary precision and makes missing data explicit', () => {
    assert.equal(formatReceiptAmount(readReceiptParams(publicReceipt)), '12.5 XLM');
    assert.equal(formatReceiptAmount(readReceiptParams({ amount: '9007199254740993.1234567', asset: 'USD' })), '9007199254740993.1234567 USD');
    assert.equal(formatReceiptAmount(readReceiptParams({ amount: '000.0000000', asset: 'XLM' })), '0 XLM');
    assert.equal(formatReceiptAmount(readReceiptParams({ amount: '5' })), '5 (unknown asset)');
    assert.equal(formatReceiptAmount(readReceiptParams({})), 'Unavailable');
  });

  it('retains native and issued assets from raw history operations in receipt routes', () => {
    for (const [operation, expected] of [
      [{ asset_type: 'native' }, 'XLM'],
      [{ asset_type: 'credit_alphanum4', asset_code: 'USD' }, 'USD'],
      [{ asset_type: 'credit_alphanum12', asset_code: 'LONGASSET123' }, 'LONGASSET123'],
    ] as const) {
      const receipt = createReceiptParams({ ...publicReceipt, asset: resolveReceiptAsset(operation) });
      assert.equal(receipt.asset, expected);
      assert.equal(formatReceiptAmount(receipt), `12.5 ${expected}`);
      assert.deepEqual(Object.keys(receipt), Object.keys(publicReceipt));
      assert.equal(receipt.status, publicReceipt.status);
    }
    assert.equal(resolveReceiptAsset({ asset: 'EUR', asset_type: 'native' }), 'EUR');
  });

  it('leaves unsupported and malformed history assets unknown instead of defaulting to XLM', () => {
    for (const operation of [
      {},
      { asset_code: 'USD' },
      { asset_type: 'liquidity_pool_shares', asset_code: 'USD' },
      { asset_type: 'credit_alphanum4', asset_code: 'TOOLONG' },
      { asset_type: 'credit_alphanum12', asset_code: ['USD'] },
      { asset_type: 'credit_alphanum12', asset_code: 'bad/code' },
    ]) {
      const receipt = createReceiptParams({ amount: '5', asset: resolveReceiptAsset(operation) });
      assert.equal(receipt.asset, '');
      assert.equal(formatReceiptAmount(receipt), '5 (unknown asset)');
    }
  });

  it('offers explorer links only for a valid hash on the matching recorded network', () => {
    const receipt = readReceiptParams(publicReceipt);
    assert.equal(canOpenReceiptExplorer(receipt, 'testnet'), true);
    assert.equal(canOpenReceiptExplorer(receipt, 'PUBLIC'), false);
    assert.equal(canOpenReceiptExplorer({ ...receipt, network: 'Public Network' }, 'MAINNET'), true);
    assert.equal(canOpenReceiptExplorer({ ...receipt, network: 'custom' }, 'custom'), false);
    assert.equal(canOpenReceiptExplorer({ ...receipt, network: '' }, 'TESTNET'), false);
    assert.equal(canOpenReceiptExplorer({ ...receipt, hash: '' }, 'TESTNET'), false);
  });
});
