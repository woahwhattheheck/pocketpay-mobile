import type { VaultActionStatus } from '../../types/vault';

export type VaultReceiptAction = 'deposit' | 'withdraw' | 'lock' | 'unlock';
export type VaultReceiptState = 'confirmed' | 'pending' | 'failed';

export interface VaultReceiptInput {
  actionType: VaultReceiptAction;
  amount?: string | null;
  result: VaultActionStatus;
  /** True for local-only actions (including lock placeholders), never on-chain. */
  simulated: boolean;
  date: string;
  explorerUrl?: string | null;
}

export interface VaultReceiptViewModel {
  actionType: VaultReceiptAction;
  amount: string;
  status: VaultReceiptState;
  date: string;
  transactionHash: string | null;
  explorerUrl: string | null;
  simulated: boolean;
  guidance: string;
}

/**
 * Only an actual 32-byte transaction hash may be linked to a public explorer.
 * Never treat locally fabricated identifiers like "mock-deposit" as a tx hash.
 */
const isTransactionHash = (value: string | undefined): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

export function buildVaultReceipt(input: VaultReceiptInput): VaultReceiptViewModel {
  const rawHash = input.result.txHash;
  const simulated = input.simulated || Boolean(rawHash?.startsWith('mock-'));
  const transactionHash = !simulated && isTransactionHash(rawHash) ? rawHash : null;
  const expectedExplorerSuffix = transactionHash ? '/tx/' + transactionHash : '';
  const explorerUrl =
    transactionHash &&
    input.explorerUrl &&
    /^https:\/\/stellar\.expert\/explorer\/(?:testnet|public)\/tx\/[a-f0-9]{64}$/i.test(input.explorerUrl) &&
    input.explorerUrl.toLowerCase().endsWith(expectedExplorerSuffix.toLowerCase())
      ? input.explorerUrl
      : null;

  let status: VaultReceiptState =
    input.result.state === 'confirmed'
      ? 'confirmed'
      : input.result.state === 'pending' || input.result.state === 'submission'
        ? 'pending'
        : 'failed';

  // A live "success" without any verifiable hash is not on-chain confirmation.
  if (!simulated && status === 'confirmed' && !transactionHash) {
    status = 'pending';
  }

  const timestamp = new Date(input.date);
  const guidance = simulated
    ? status === 'confirmed'
      ? 'Local preview complete. No on-chain transaction was submitted.'
      : status === 'pending'
        ? 'Local preview has not completed. No on-chain confirmation is available.'
        : 'Local preview failed. No on-chain transaction was submitted.'
    : status === 'confirmed'
      ? 'This transaction has been confirmed on the network.'
      : status === 'pending'
        ? 'Status is pending or unknown. Check activity or the explorer before attempting another transaction.'
        : 'The action could not be completed. Check account activity before retrying.';

  return {
    actionType: input.actionType,
    amount: input.amount?.trim() || '',
    status,
    date: Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString() : 'Unavailable',
    transactionHash,
    explorerUrl,
    simulated,
    guidance,
  };
}
