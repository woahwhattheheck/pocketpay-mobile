/** Public receipt data only. A receipt is a snapshot, not independent ledger proof. */
export const RECEIPT_STATUSES = ['successful', 'pending', 'failed', 'rejected', 'unknown'] as const;
export type PaymentReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export interface ReceiptStatusEvidence {
  status?: unknown;
  is_pending?: boolean;
  transaction_successful?: boolean;
}

export interface PaymentReceipt {
  status: PaymentReceiptStatus;
  hash: string;
  amount: string;
  asset: string;
  destination: string;
  date: string;
  network: string;
}

export type ReceiptRouteParams = { [K in keyof PaymentReceipt]: string };
export type ReceiptInput = Partial<Record<keyof PaymentReceipt, unknown>>;

export const RECEIPT_COPY = {
  successful: {
    label: 'Successful', title: 'Payment Confirmed', tone: 'success',
    description: 'The payment flow reported network confirmation.',
  },
  pending: {
    label: 'Pending', title: 'Payment Pending', tone: 'warning',
    description: 'Confirmation is still pending. Check activity before sending again.',
  },
  failed: {
    label: 'Failed', title: 'Payment Failed', tone: 'error',
    description: 'The network reported an unsuccessful transaction. This receipt does not confirm delivery of funds.',
  },
  rejected: {
    label: 'Rejected', title: 'Payment Rejected', tone: 'warning',
    description: 'This request was cancelled or rejected before submission.',
  },
  unknown: {
    label: 'Unknown', title: 'Outcome Unknown', tone: 'neutral',
    description: 'Confirmation is unavailable. Check activity or the explorer before retrying; a timeout does not prove failure.',
  },
} as const;

function isReceiptStatus(value: unknown): value is PaymentReceiptStatus {
  return typeof value === 'string' && (RECEIPT_STATUSES as readonly string[]).includes(value);
}

/** Never infer successful settlement just because a hash exists or flags are missing. */
export function resolveReceiptStatus(evidence: ReceiptStatusEvidence): PaymentReceiptStatus {
  if (evidence.is_pending === true) return 'pending';
  if (evidence.transaction_successful === false) return 'failed';
  if (evidence.transaction_successful === true) return 'successful';
  return isReceiptStatus(evidence.status) ? evidence.status : 'unknown';
}

function scalar(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) return '';
  return value.trim();
}

export interface ReceiptAssetEvidence {
  asset?: unknown;
  asset_type?: unknown;
  asset_code?: unknown;
}

/** History may contain normalized records or raw Horizon payment operations. */
export function resolveReceiptAsset(evidence: ReceiptAssetEvidence): string {
  const normalized = scalar(evidence.asset, 12);
  if (/^[a-z\d]{1,12}$/i.test(normalized)) return normalized;
  if (evidence.asset_type === 'native') return 'XLM';

  const maxLength = evidence.asset_type === 'credit_alphanum4' ? 4
    : evidence.asset_type === 'credit_alphanum12' ? 12 : 0;
  const code = scalar(evidence.asset_code, maxLength);
  return /^[a-z\d]{1,12}$/i.test(code) ? code : '';
}

/** Whitelist route fields; repeated parameters and arbitrary objects are not receipts. */
export function readReceiptParams(params: ReceiptInput): PaymentReceipt {
  const amount = scalar(params.amount, 128);
  const hash = scalar(params.hash, 64);
  const date = scalar(params.date, 64);
  const asset = scalar(params.asset, 12);
  const destination = scalar(params.destination, 128);
  return {
    status: resolveReceiptStatus({ status: params.status }),
    hash: /^[a-f\d]{64}$/i.test(hash) ? hash.toLowerCase() : '',
    amount: /^\d+(?:\.\d{1,7})?$/.test(amount) ? amount : '',
    asset: /^[a-z\d]{1,12}$/i.test(asset) ? asset : '',
    // Receipts show public accounts, never an accidentally forwarded secret seed.
    destination: /^(?:G[A-Z2-7]{55}|M[A-Z2-7]{68})$/.test(destination) ? destination : '',
    date: /^\d{4}-\d{2}-\d{2}T/.test(date) && Number.isFinite(Date.parse(date)) ? date : '',
    network: scalar(params.network, 64),
  };
}

export function createReceiptParams(receipt: ReceiptInput): ReceiptRouteParams {
  return { ...readReceiptParams(receipt) };
}

export function formatReceiptAmount(receipt: Pick<PaymentReceipt, 'amount' | 'asset'>): string {
  if (!receipt.amount) return 'Unavailable';
  const [whole, decimal = ''] = receipt.amount.split('.');
  const fraction = decimal.replace(/0+$/, '');
  // Preserve decimal precision: do not convert monetary values to floating point.
  const amount = whole.replace(/^0+(?=\d)/, '') + (fraction ? `.${fraction}` : '');
  return `${amount} ${receipt.asset || '(unknown asset)'}`;
}

export function normalizeReceiptNetwork(network: string): 'public' | 'testnet' | null {
  switch (network.trim().toLowerCase()) {
    case 'public':
    case 'mainnet':
    case 'public network':
      return 'public';
    case 'testnet':
      return 'testnet';
    default:
      return null;
  }
}

/** Use the existing explorer builder only for a valid hash on the recorded network. */
export function canOpenReceiptExplorer(receipt: PaymentReceipt, configuredNetwork: string): boolean {
  const recorded = normalizeReceiptNetwork(receipt.network);
  return /^[a-f\d]{64}$/i.test(receipt.hash) && recorded !== null
    && recorded === normalizeReceiptNetwork(configuredNetwork);
}
