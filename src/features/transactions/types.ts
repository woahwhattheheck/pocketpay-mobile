/**
 * Transaction feature types and interfaces
 */

import type { PaymentReceiptStatus } from './receipt';

export interface TransactionDetail {
  id: string;
  from?: string;
  to?: string;
  into?: string;
  amount?: string;
  asset?: string;
  asset_type?: string;
  asset_code?: string;
  created_at?: string;
  createdAt?: string;
  timestamp?: string;
  hash?: string;
  transaction_hash?: string;
  memo?: string;
  memo_type?: string;
  transaction_successful?: boolean;
  is_pending?: boolean;
  status?: PaymentReceiptStatus;
  network?: string;
  type?: string;
  paging_token?: string;
  is_vault?: boolean;
}

export type TransactionStatus = PaymentReceiptStatus;

export interface TransactionStatusConfig {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
}

export interface TransactionMetadata {
  isSent: boolean;
  directionLabel: string;
  formattedAmount: string;
  formattedDate: string;
  status: TransactionStatus;
  counterparty: string | null;
}
