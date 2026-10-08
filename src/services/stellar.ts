import * as StellarSdk from '@stellar/stellar-sdk';
import * as ExpoCrypto from 'expo-crypto';
import { Buffer } from 'buffer';

export const server = new StellarSdk.Horizon.Server(
  process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
);

/** Horizon operation record type used for transaction history. */
export type PaymentRecord = StellarSdk.Horizon.ServerApi.OperationRecord;

/**
 * Generates a new Stellar Keypair.
 * This function returns both the public and secret keys.
 * The secret key MUST be stored securely using SecureStore.
 */
export const generateKeypair = () => {
  const seed = ExpoCrypto.getRandomValues(new Uint8Array(32));
  const keypair = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(seed));
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
};

/**
 * Horizon returns 404 for accounts that don't exist on the network yet
 * (i.e. never funded). The SDK surfaces this as a NotFoundError with the
 * message "Not Found", while our own wrapper throws "Account not found".
 */
const isNotFoundError = (error: any): boolean =>
  error?.response?.status === 404 || /not found/i.test(error?.message || '');

/**
 * Helper to fetch account details including balances.
 */
export const fetchAccountDetails = async (publicKey: string) => {
  try {
    const account = await server.loadAccount(publicKey);
    return account;
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      throw new Error('Account not found on the network. Please fund it first.');
    }
    throw error;
  }
};

/**
 * Fetch the XLM balance for a given public key.
 */
export const fetchXlmBalance = async (publicKey: string): Promise<string> => {
  try {
    const account = await fetchAccountDetails(publicKey);
    const nativeBalance = account.balances.find((b: any) => b.asset_type === 'native');
    return nativeBalance ? nativeBalance.balance : '0.0000000';
  } catch (error: any) {
    // If account is not found (unfunded), balance is 0
    if (isNotFoundError(error)) {
      return '0.0000000';
    }
    throw error;
  }
};

/**
 * Fetch recent transactions for a given public key.
 */
export const fetchRecentTransactions = async (
  publicKey: string,
  limit: number = 20
): Promise<any[]> => {
  try {
    const response = await server
      .operations()
      .forAccount(publicKey)
      .order('desc')
      .limit(limit)
      .call();

    return response.records;
  } catch (error: any) {
    if (isNotFoundError(error)) {
      return [];
    }
    console.error('Error fetching transactions:', error);
    throw error;
  }
};

export interface TransactionsPage {
  /** Fetched operation records for this page. */
  records: any[];
  /**
   * Paging token (cursor) of the oldest record in this page.
   * Pass this as `cursor` to `fetchTransactionsPage` to load the next
   * (older) page.  `null` means there are no more pages.
   */
  nextCursor: string | null;
  /** True when fewer records than `limit` were returned — no more pages. */
  hasMore: boolean;
}

/**
 * Fetch a page of operations for `publicKey`, ordered descending
 * (newest-first).  Supports cursor-based "load more older" pagination.
 *
 * @param publicKey  – Stellar public key to query.
 * @param limit      – Page size (default 20).
 * @param cursor     – Paging token from a previous page to continue from.
 *                    Pass `undefined` / omit to start from the latest.
 */
export const fetchTransactionsPage = async (
  publicKey: string,
  limit: number = 20,
  cursor?: string
): Promise<TransactionsPage> => {
  try {
    let builder = server
      .operations()
      .forAccount(publicKey)
      .order('desc')
      .limit(limit);

    if (cursor) {
      builder = builder.cursor(cursor);
    }

    const response = await builder.call();
    const records = response.records;
    const hasMore = records.length === limit;

    // The cursor for the next page is the paging_token of the last (oldest)
    // record returned.  Horizon uses paging_token as the cursor value.
    const nextCursor =
      hasMore && records.length > 0
        ? (records[records.length - 1] as any).paging_token ?? null
        : null;

    return { records, nextCursor, hasMore };
  } catch (error: any) {
    if (error.message && error.message.includes('not found')) {
      return { records: [], nextCursor: null, hasMore: false };
    }
    console.error('Error fetching transactions page:', error);
    throw error;
  }
};

/**
 * Fetch a single operation by its Horizon ID.  Used by the transaction detail
 * screen when arriving via deep link — the operation may not be in the local
 * store yet.
 *
 * @param operationId  – Horizon operation ID (numeric string or paging token).
 * @returns The operation record, or `null` if not found on the network.
 */
export const fetchOperationById = async (
  operationId: string
): Promise<PaymentRecord | null> => {
  try {
    const record = await server.operations().operation(operationId).call();
    return record as PaymentRecord;
  } catch (error: any) {
    if (isNotFoundError(error)) {
      return null;
    }
    console.error('Error fetching operation by ID:', error);
    throw error;
  }
};

/**
 * A signed transaction was sent to Horizon but the response did not prove
 * acceptance or rejection. Its public hash is safe to use for reconciliation;
 * callers MUST NOT blindly create or submit a replacement transaction.
 */
export class TransactionSubmissionUnknownError extends Error {
  readonly hash: string;

  constructor(hash: string) {
    super('Transaction submission status is unknown. Check the original hash before sending again.');
    this.name = 'TransactionSubmissionUnknownError';
    this.hash = hash;
  }
}

/** Horizon explicitly rejected the signed transaction with a result code. */
export class TransactionSubmissionRejectedError extends Error {
  readonly resultCode: string;

  constructor(resultCode: string) {
    super('Transaction rejected by the network.');
    this.name = 'TransactionSubmissionRejectedError';
    this.resultCode = resultCode;
  }
}

/** No transaction was submitted, so a network payment could not have occurred. */
export class TransactionPreparationError extends Error {
  constructor() {
    super('Could not prepare the transaction. No payment was submitted.');
    this.name = 'TransactionPreparationError';
  }
}

export type SubmittedTransactionStatus = 'confirmed' | 'rejected' | 'not_found' | 'unavailable';

/**
 * Check the EXACT signed transaction hash on the configured Horizon network.
 * A 404 is "not yet found", never proof of non-submission; other failed
 * lookups are unavailable, not definitive transaction rejection.
 */
export const checkSubmittedTransaction = async (hash: string): Promise<SubmittedTransactionStatus> => {
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error('Invalid public transaction hash.');
  }

  try {
    const record = await server.transactions().transaction(hash).call();
    if (record.successful === true) return 'confirmed';
    if (record.successful === false) return 'rejected';
    return 'unavailable';
  } catch (error: any) {
    if (error?.response?.status === 404) return 'not_found';
    return 'unavailable';
  }
};

/**
 * Send XLM to a destination address. Preparation and submission are separate
 * error boundaries: failure before signing/submission is definitively local,
 * a Horizon result code is a definite network rejection, while a timeout or
 * transport interruption AFTER submission requires same-hash reconciliation.
 */
export const sendXlmTransaction = async (
  secretKey: string,
  destinationPublicKey: string,
  amount: string,
  memoText?: string
) => {
  let transaction: StellarSdk.Transaction;

  try {
    const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
    const account = await server.loadAccount(sourceKeypair.publicKey());
    const fee = await server.fetchBaseFee();

    const builder = new StellarSdk.TransactionBuilder(account, {
      fee: fee.toString(),
      networkPassphrase: process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET,
    });
    builder.addOperation(
      StellarSdk.Operation.payment({
        destination: destinationPublicKey,
        asset: StellarSdk.Asset.native(),
        amount,
      })
    );
    if (memoText) builder.addMemo(StellarSdk.Memo.text(memoText));

    builder.setTimeout(30);
    transaction = builder.build();
    transaction.sign(sourceKeypair);
  } catch {
    // Never print raw errors here: the signing key and transaction internals
    // may be present in SDK/network error objects.
    throw new TransactionPreparationError();
  }

  try {
    return await server.submitTransaction(transaction);
  } catch (error: any) {
    const code = error?.response?.data?.extras?.result_codes?.transaction;
    if (typeof code === 'string' && /^tx_[a-z_]+$/.test(code)) {
      throw new TransactionSubmissionRejectedError(code);
    }
    // A transport exception tells us nothing about whether Horizon accepted
    // this signed envelope. The hash is deterministic and contains no secret.
    throw new TransactionSubmissionUnknownError(transaction.hash().toString('hex'));
  }
};

const isAccountNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ACCOUNT_NOT_FOUND';

/**
 * Fund a Stellar testnet account using Friendbot.
 * Only works on testnet; throws on mainnet or if funding fails.
 */
export const fundWithFriendbot = async (publicKey: string): Promise<void> => {
  try {
    const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Friendbot error: ${response.statusText}`);
    }
  } catch (error: any) {
    console.error('Friendbot funding failed:', error);
    throw new Error(error.message || 'Friendbot funding failed');
  }
};

/**
 * MOCK SERVICE WRAPPERS FOR SOROBAN SAVINGS VAULT
 *
 * Used as a fallback by the vault store when EXPO_PUBLIC_VAULT_CONTRACT_ID
 * is not set. The real Soroban implementations live in ./vault.ts.
 */

export const mockConnectVault = async (publicKey: string): Promise<boolean> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  return true;
};

export const mockFetchVaultBalance = async (publicKey: string): Promise<string> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return '0.0000000'; // Default placeholder
};

export const mockDepositToVault = async (secretKey: string, amount: string): Promise<boolean> => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  return true;
};

export const mockFetchVaultMaturedLocks = async (publicKey: string): Promise<{ id: string; amount: string; unlockedAt: string }[]> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  // Return mock matured locks for preview purposes
  return [
    {
      id: 'lock_a1b2c3d4e5f6',
      amount: '50.0000000',
      unlockedAt: new Date(Date.now() - 86400000 * 3).toISOString(), // 3 days ago
    },
    {
      id: 'lock_f6e5d4c3b2a1',
      amount: '25.5000000',
      unlockedAt: new Date(Date.now() - 86400000 * 7).toISOString(), // 7 days ago
    },
  ];
};

export const mockWithdrawFromVault = async (secretKey: string, amount: string): Promise<boolean> => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  return true;
};

/**
 * Networks with a known stellar.expert explorer path. Anything else (e.g. a
 * custom standalone network) has no public explorer, so callers should treat
 * a `null` result as "no explorer link available".
 */
const EXPLORER_NETWORK_PATHS: Record<string, string> = {
  TESTNET: 'testnet',
  PUBLIC: 'public',
  MAINNET: 'public',
};

/**
 * Builds a stellar.expert transaction URL for the network configured via
 * EXPO_PUBLIC_STELLAR_NETWORK (defaults to Testnet, matching this app's
 * default network). Returns null when there is no hash or no known explorer
 * for the configured network.
 */
export const getExplorerTxUrl = (hash: string | null | undefined): string | null => {
  if (!hash) return null;
  const network = (process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'TESTNET').toUpperCase();
  const explorerNetwork = EXPLORER_NETWORK_PATHS[network];
  if (!explorerNetwork) return null;
  return `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}`;
};

/**
 * Checks if the connected Horizon server's network passphrase matches the expected passphrase.
 * Returns true if it matches, false if it doesn't match.
 * Throws if the server is unreachable.
 */
export const checkNetworkPassphrase = async (): Promise<boolean> => {
  const root = await server.root();
  const expectedPassphrase = process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET;
  return root.network_passphrase === expectedPassphrase;
};
