import { buildVaultReceipt } from '../src/features/vault/receiptModel';

const HASH = 'a'.repeat(64);
const URL = 'https://stellar.expert/explorer/testnet/tx/' + HASH;

describe('vault transaction receipt truth (#392)', () => {
  const base = { actionType: 'deposit' as const, amount: '4.25', date: '2026-10-08T01:00:00.000Z' };

  it('shows a confirmed on-chain receipt only with a real hash and matching explorer URL', () => {
    const vm = buildVaultReceipt({ ...base, result: { state: 'confirmed', txHash: HASH }, simulated: false, explorerUrl: URL });
    expect(vm.status).toBe('confirmed');
    expect(vm.transactionHash).toBe(HASH);
    expect(vm.explorerUrl).toBe(URL);
    expect(vm.simulated).toBe(false);
    expect(vm.date).toContain('2026');
  });

  it('never marks a real completion without a verifiable hash as confirmed', () => {
    const vm = buildVaultReceipt({ ...base, result: { state: 'confirmed' }, simulated: false });
    expect(vm.status).toBe('pending');
    expect(vm.transactionHash).toBeNull();
    expect(vm.guidance).toMatch(/before attempting another transaction/i);
  });

  it('keeps post-submission confirmation errors pending rather than encouraging a blind retry', () => {
    const vm = buildVaultReceipt({ ...base, result: { state: 'pending', txHash: HASH, error: 'timeout' }, simulated: false, explorerUrl: URL });
    expect(vm.status).toBe('pending');
    expect(vm.transactionHash).toBe(HASH);
    expect(vm.guidance).toMatch(/before attempting another transaction/i);
    expect(vm.guidance).not.toContain('timeout');
  });

  it('renders failure without success claims or a fabricated transaction link', () => {
    const vm = buildVaultReceipt({ ...base, result: { state: 'failed', error: 'secret material' }, simulated: false, explorerUrl: URL });
    expect(vm.status).toBe('failed');
    expect(vm.transactionHash).toBeNull();
    expect(vm.explorerUrl).toBeNull();
    expect(vm.guidance).not.toContain('secret material');
  });

  it('marks local lock previews explicitly and never publishes mock hashes', () => {
    const vm = buildVaultReceipt({ ...base, actionType: 'lock', result: { state: 'confirmed', txHash: 'mock-lock' }, simulated: true, explorerUrl: URL });
    expect(vm.simulated).toBe(true);
    expect(vm.transactionHash).toBeNull();
    expect(vm.explorerUrl).toBeNull();
    expect(vm.guidance).toMatch(/no on-chain transaction/i);
  });

  it('rejects mismatched explorer links and malformed transaction hashes', () => {
    const differentUrl = 'https://stellar.expert/explorer/testnet/tx/' + 'b'.repeat(64);
    expect(buildVaultReceipt({ ...base, result: { state: 'confirmed', txHash: HASH }, simulated: false, explorerUrl: differentUrl }).explorerUrl).toBeNull();
    const invalid = buildVaultReceipt({ ...base, result: { state: 'confirmed', txHash: 'tx_hash_fake' }, simulated: false, explorerUrl: URL });
    expect(invalid.status).toBe('pending');
    expect(invalid.explorerUrl).toBeNull();
  });

  it('distinguishes matured-lock withdrawal without inventing an amount or settled hash', () => {
    const vm = buildVaultReceipt({ ...base, actionType: 'unlock', amount: undefined, result: { state: 'pending' }, simulated: false });
    expect(vm.actionType).toBe('unlock');
    expect(vm.amount).toBe('');
    expect(vm.status).toBe('pending');
    expect(vm.transactionHash).toBeNull();
  });

  it('does not expose an explorer link for a local mock even if an apparently real hash is passed', () => {
    const vm = buildVaultReceipt({ ...base, result: { state: 'confirmed', txHash: HASH }, simulated: true, explorerUrl: URL });
    expect(vm.transactionHash).toBeNull();
    expect(vm.explorerUrl).toBeNull();
  });
});
