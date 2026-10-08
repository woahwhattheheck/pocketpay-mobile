/**
 * Payment success receipt view-model (issue #216).
 *
 * The payment-success screen (app/payment-success.tsx) currently derives all of
 * its receipt strings inline -- the amount + "XLM" suffix, the date formatting
 * and fallback, the destination fallback -- and it renders the full raw
 * transaction hash. Issue #216 asks the receipt to show recipient, amount,
 * date, a copyable hash and an explorer link "where configured", while keeping
 * the UI non-technical and avoiding raw technical payloads.
 *
 * This module is the pure, framework-free view-model behind that receipt: one
 * function turns the raw route params into ready-to-render, non-technical
 * strings with graceful fallbacks for every missing/invalid field, truncates
 * the hash for display, and preserves the full hash for copy-to-clipboard. It
 * imports no React Native / Expo code and changes no existing behaviour, so it
 * can be unit-tested exhaustively and adopted by the screen incrementally.
 */

import { formatAmount } from '../../utils/amount';

/** Shown for any receipt field that is missing or cannot be parsed. */
export const RECEIPT_PLACEHOLDER = '\u2014'; // em dash

/** Character inserted between the kept head and tail of a truncated hash. */
export const HASH_ELLIPSIS = '\u2026'; // horizontal ellipsis

/** Number of leading hash characters kept in the non-technical display form. */
export const HASH_LEAD = 6;

/** Number of trailing hash characters kept in the non-technical display form. */
export const HASH_TAIL = 6;

/** Raw receipt inputs, typically the route params of the success screen. */
export interface PaymentReceiptInput {
  hash?: string | null;
  amount?: string | null;
  destination?: string | null;
  date?: string | null;
  /** Optional human label resolved from contacts for the destination. */
  destinationLabel?: string | null;
  /**
   * Explorer transaction URL, or null/undefined when no explorer is configured
   * for the active network. The caller computes this (e.g. via the stellar
   * service) so this module stays pure and network-agnostic.
   */
  explorerUrl?: string | null;
}

/** Ready-to-render receipt fields. Every string is safe to display as-is. */
export interface PaymentReceiptViewModel {
  displayAmount: string;
  displayDate: string;
  displayDestination: string;
  /** Non-technical, truncated hash for display (never the raw full value). */
  displayHash: string;
  /** Full hash, preserved for copy-to-clipboard, or null when unavailable. */
  fullHash: string | null;
  /** Human contact label for the destination, when known. */
  destinationLabel: string | null;
  canCopyHash: boolean;
  explorerUrl: string | null;
  hasExplorerLink: boolean;
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Format the amount for the receipt, appending the "XLM" unit. Falls back to the
 * placeholder (with no unit) when the amount is missing or non-numeric.
 */
export function formatReceiptAmount(amount: string | number | null | undefined): string {
  const formatted = formatAmount(amount ?? undefined);
  if (!formatted || formatted === RECEIPT_PLACEHOLDER) {
    return RECEIPT_PLACEHOLDER;
  }
  return formatted + ' XLM';
}

/**
 * Format an ISO/parseable date string for the receipt. Missing or invalid dates
 * degrade to the placeholder rather than throwing or rendering "Invalid Date".
 */
export function formatReceiptDate(date: string | null | undefined): string {
  if (!isNonEmpty(date)) {
    return RECEIPT_PLACEHOLDER;
  }
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    return RECEIPT_PLACEHOLDER;
  }
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Truncate a hash to a short, non-technical form keeping the leading and
 * trailing characters so it is still recognisable. The full value is preserved
 * separately for copying. Returns the placeholder for a missing hash and
 * returns short hashes unchanged.
 */
export function truncateHash(
  hash: string | null | undefined,
  lead: number = HASH_LEAD,
  tail: number = HASH_TAIL,
): string {
  if (!isNonEmpty(hash)) {
    return RECEIPT_PLACEHOLDER;
  }
  const trimmed = hash.trim();
  if (trimmed.length <= lead + tail + 1) {
    return trimmed;
  }
  return trimmed.slice(0, lead) + HASH_ELLIPSIS + trimmed.slice(trimmed.length - tail);
}

/**
 * Build the full receipt view-model from raw inputs. Pure and total: it never
 * throws and always returns display-safe strings, so the screen can render the
 * receipt without any additional guarding.
 */
export function buildPaymentReceipt(input: PaymentReceiptInput): PaymentReceiptViewModel {
  const fullHash = isNonEmpty(input.hash) ? input.hash.trim() : null;
  const explorerUrl = isNonEmpty(input.explorerUrl) ? input.explorerUrl.trim() : null;
  const destination = isNonEmpty(input.destination) ? input.destination.trim() : null;
  const destinationLabel = isNonEmpty(input.destinationLabel)
    ? input.destinationLabel.trim()
    : null;

  return {
    displayAmount: formatReceiptAmount(input.amount),
    displayDate: formatReceiptDate(input.date),
    displayDestination: destination ?? RECEIPT_PLACEHOLDER,
    displayHash: truncateHash(fullHash),
    fullHash,
    destinationLabel,
    canCopyHash: fullHash !== null,
    explorerUrl,
    hasExplorerLink: explorerUrl !== null,
  };
}
/** Issue #522: receipts are not necessarily successful or even terminal. */
export type ReceiptOutcome = 'success' | 'pending' | 'failed' | 'rejected' | 'unknown';

export interface ReceiptOutcomeCopy {
  title: string;
  description: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}

export const RECEIPT_OUTCOME_COPY: Record<ReceiptOutcome, ReceiptOutcomeCopy> = {
  success: {
    title: 'Transaction confirmed',
    description: 'The network confirmed this transaction.',
    tone: 'success',
  },
  pending: {
    title: 'Transaction pending',
    description: 'The outcome is not final. Check the network before sending again.',
    tone: 'info',
  },
  failed: {
    title: 'Transaction failed',
    description: 'This attempt failed. Check your activity before retrying.',
    tone: 'error',
  },
  rejected: {
    title: 'Transaction rejected',
    description: 'The transaction was rejected or cancelled before completion.',
    tone: 'warning',
  },
  unknown: {
    title: 'Transaction status unknown',
    description: 'Confirmation is unavailable. Do not resubmit until you verify the outcome.',
    tone: 'warning',
  },
};

export function normalizeReceiptOutcome(raw: string | undefined | null): ReceiptOutcome {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'success':
    case 'succeeded':
    case 'successful':
    case 'confirmed':
      return 'success';
    case 'submitted':
    case 'pending':
      return 'pending';
    case 'failure':
    case 'failed':
      return 'failed';
    case 'cancelled':
    case 'canceled':
    case 'rejected':
      return 'rejected';
    default:
      return 'unknown';
  }
}

export interface TypedReceiptInput extends PaymentReceiptInput {
  outcome?: string | null;
  asset?: string | null;
}

export interface TypedReceiptViewModel extends PaymentReceiptViewModel {
  outcome: ReceiptOutcome;
  outcomeCopy: ReceiptOutcomeCopy;
  displayAsset: string;
  displayValue: string;
}

/**
 * Create an outcome-aware receipt from public data only. A missing status
 * must NEVER imply success even if a transaction hash exists.
 */
export function buildTypedReceipt(input: TypedReceiptInput): TypedReceiptViewModel {
  const outcome = normalizeReceiptOutcome(input.outcome);
  const asset = (input.asset || 'XLM').trim().toUpperCase();
  const displayAsset = /^[A-Z0-9]{1,12}$/.test(asset) ? asset : 'XLM';
  const amount = formatAmount(input.amount ?? undefined);
  const validHash = typeof input.hash === 'string' && /^[a-f0-9]{64}$/i.test(input.hash.trim());
  const base = buildPaymentReceipt({
    ...input,
    hash: validHash ? input.hash : null,
    explorerUrl: validHash ? input.explorerUrl : null,
  });
  return {
    ...base,
    outcome,
    outcomeCopy: RECEIPT_OUTCOME_COPY[outcome],
    displayAsset,
    displayValue: amount && amount !== RECEIPT_PLACEHOLDER
      ? amount + ' ' + displayAsset
      : RECEIPT_PLACEHOLDER,
  };
}
