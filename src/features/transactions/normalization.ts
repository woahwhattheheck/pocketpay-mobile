import type { TransactionDetail } from './types';

export type NormalizedTransactionStatus =
  | 'confirmed'
  | 'pending'
  | 'failed'
  | 'unknown';

export type TransactionDirection = 'sent' | 'received' | 'unknown';
export type TransactionActivityKind = 'payment' | 'vault' | 'other';

export type TransactionHistoryFilter =
  | 'all'
  | 'sent'
  | 'received'
  | 'pending'
  | 'failed'
  | 'unknown'
  | 'vault';

/**
 * Canonical transaction shape consumed by the wallet store and activity UI.
 * Raw Horizon/local fields are preserved for compatibility, while the fields
 * below are normalized across network, optimistic, and vault records.
 */
export interface NormalizedTransactionRecord extends TransactionDetail {
  id: string;
  status: NormalizedTransactionStatus;
  direction: TransactionDirection;
  activityKind: TransactionActivityKind;
  isVault: boolean;
  asset: string;
}

type TransactionInput = TransactionDetail & Record<string, any>;

const firstString = (
  record: Record<string, any>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
};

const normalizeStatus = (
  record: Record<string, any>,
): NormalizedTransactionStatus => {
  const explicit =
    typeof record.status === 'string' ? record.status.toLowerCase() : '';

  if (record.is_pending === true || explicit === 'pending') {
    return 'pending';
  }

  if (record.transaction_successful === false || explicit === 'failed') {
    return 'failed';
  }

  if (
    record.transaction_successful === true ||
    explicit === 'confirmed' ||
    explicit === 'successful' ||
    explicit === 'success'
  ) {
    return 'confirmed';
  }

  return 'unknown';
};

const normalizeAsset = (record: Record<string, any>): string => {
  const explicit = firstString(record, 'asset');
  if (explicit) return explicit;

  if (record.asset_type === 'native') return 'XLM';

  return firstString(record, 'asset_code') ?? 'XLM';
};

const normalizeKind = (
  record: Record<string, any>,
): TransactionActivityKind => {
  const rawType = firstString(record, 'type')?.toLowerCase() ?? '';
  const isVault =
    record.is_vault === true ||
    record.isVault === true ||
    rawType === 'invoke_host_function' ||
    rawType.includes('vault');

  if (isVault) return 'vault';

  if (
    rawType === 'payment' ||
    rawType.startsWith('path_payment') ||
    rawType === 'create_account' ||
    (firstString(record, 'amount', 'starting_balance') &&
      (firstString(record, 'from', 'funder', 'source_account') ||
        firstString(record, 'to', 'into', 'account', 'destination')))
  ) {
    return 'payment';
  }

  return 'other';
};

const normalizeDirection = (
  from: string | undefined,
  to: string | undefined,
  currentPublicKey?: string | null,
): TransactionDirection => {
  if (!currentPublicKey) return 'unknown';
  if (from === currentPublicKey) return 'sent';
  if (to === currentPublicKey) return 'received';
  return 'unknown';
};

export const normalizeTransactionRecord = (
  input: TransactionInput | Record<string, any>,
  currentPublicKey?: string | null,
): NormalizedTransactionRecord => {
  const record = input as Record<string, any>;
  const from = firstString(record, 'from', 'funder', 'source_account');
  const to = firstString(record, 'to', 'into', 'account', 'destination');
  const amount = firstString(record, 'amount', 'starting_balance');
  const createdAt = firstString(record, 'createdAt', 'created_at', 'timestamp');
  const hash = firstString(record, 'hash', 'transaction_hash');
  const status = normalizeStatus(record);
  const activityKind = normalizeKind(record);
  const isVault = activityKind === 'vault';
  const id =
    firstString(record, 'id', 'paging_token', 'hash', 'transaction_hash') ??
    [
      firstString(record, 'type') ?? 'transaction',
      createdAt ?? 'unknown-date',
      from ?? 'unknown-source',
      to ?? 'unknown-destination',
    ].join(':');

  const transactionSuccessful =
    typeof record.transaction_successful === 'boolean'
      ? record.transaction_successful
      : status === 'confirmed'
        ? true
        : status === 'failed'
          ? false
          : undefined;

  return {
    ...record,
    id,
    from,
    to,
    amount,
    asset: normalizeAsset(record),
    createdAt,
    created_at: createdAt,
    hash,
    transaction_hash: hash,
    status,
    direction: normalizeDirection(from, to, currentPublicKey),
    activityKind,
    isVault,
    is_vault: isVault,
    is_pending: status === 'pending',
    transaction_successful: transactionSuccessful,
  } as NormalizedTransactionRecord;
};

export const normalizeTransactionRecords = (
  records: Array<TransactionInput | Record<string, any>>,
  currentPublicKey?: string | null,
): NormalizedTransactionRecord[] =>
  records.map((record) => normalizeTransactionRecord(record, currentPublicKey));

export const matchesTransactionFilter = (
  transaction: NormalizedTransactionRecord,
  filter: TransactionHistoryFilter,
): boolean => {
  switch (filter) {
    case 'all':
      return true;
    case 'sent':
    case 'received':
      return (
        transaction.activityKind !== 'vault' &&
        transaction.direction === filter
      );
    case 'pending':
    case 'failed':
    case 'unknown':
      return transaction.status === filter;
    case 'vault':
      return transaction.activityKind === 'vault';
    default:
      return true;
  }
};
