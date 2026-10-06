/**
 * Standardised QR receive payload builder (issue #406).
 *
 * Two formats, chosen automatically based on what the requester asks for:
 *
 * - Address-only: the bare Stellar public key, unchanged from the app's
 *   existing behaviour. Any Stellar wallet can scan this, not just
 *   PocketPay - so it stays the plain address rather than a URI, to not
 *   regress compatibility for the common case (someone just wants to be
 *   paid, with no specific amount).
 * - Payment request: once an amount, asset, or memo is specified, there's
 *   no way to encode that into a bare address, so the payload switches to
 *   a `web+stellar:pay` URI modelled on SEP-0007 (the Stellar ecosystem's
 *   URI scheme for delegated signing / payment requests -
 *   https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md).
 *   `memo_type` values (`MEMO_TEXT` / `MEMO_ID` / `MEMO_HASH` / `MEMO_RETURN`)
 *   follow SEP-0007's documented parameter values, which is a different
 *   casing than the SDK's own internal memo type strings
 *   (`stellar-sdk`'s `Memo` class uses lowercase `"text"` / `"id"` / etc -
 *   verified against `node_modules/@stellar/stellar-sdk`'s type
 *   declarations - because that's the wire format for building an XDR
 *   transaction, not a URI query parameter).
 */

import { CURRENT_STELLAR_NETWORK } from '../../constants/network';
import { validateAddress, validateAmount, validateMemo } from '../../utils/validation';

export type ReceiveMemoType = 'MEMO_TEXT' | 'MEMO_ID' | 'MEMO_HASH' | 'MEMO_RETURN';

export interface ReceivePayloadParams {
  /** The Stellar public key funds should be sent to. Required. */
  destination: string;
  /** Requested amount, as a plain decimal string (e.g. "10.5"). Validate
   * with `validateAmount` from `src/utils/validation.ts` before calling -
   * this function does not re-validate it. */
  amount?: string;
  /** Issued asset code. Only included in the payload if `assetIssuer` is
   * also provided - SEP-0007 requires both together; a code alone is
   * ambiguous. Omit both for a native XLM request. */
  assetCode?: string;
  assetIssuer?: string;
  /** Optional memo. Validate with `validateMemo` before calling. */
  memo?: string;
  /** Defaults to `MEMO_TEXT` when `memo` is set and this is omitted. */
  memoType?: ReceiveMemoType;
}

const STELLAR_PAY_URI_PREFIX = 'web+stellar:pay';
const TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

export interface ReceivePayloadValidationErrors {
  destination?: string;
  network?: string;
  amount?: string;
  memo?: string;
  asset?: string;
}

export interface ReceivePayloadResult {
  payload: string;
  errors: ReceivePayloadValidationErrors;
  isValid: boolean;
}

/**
 * Validate the complete receive request before a QR is rendered.
 *
 * The mobile app is currently Testnet/XLM-only. The low-level formatter remains
 * capable of representing issued assets for forward compatibility, but the
 * current screen must not advertise fields the rest of the app cannot honor.
 */
export function validateReceivePayload(
  params: ReceivePayloadParams,
  network: string = CURRENT_STELLAR_NETWORK,
): ReceivePayloadValidationErrors {
  const errors: ReceivePayloadValidationErrors = {};

  const destinationError = validateAddress(params.destination);
  if (destinationError) {
    errors.destination = destinationError;
  }

  if (network.trim().toUpperCase() !== 'TESTNET') {
    errors.network = `Receive QR codes are only supported on Stellar Testnet. Current network: ${network.trim() || 'unknown'}.`;
  }

  const trimmedAmount = params.amount?.trim();
  if (trimmedAmount) {
    const amountError = validateAmount(trimmedAmount);
    if (amountError) errors.amount = amountError;
  }

  const trimmedMemo = params.memo?.trim();
  if (trimmedMemo) {
    const memoType = params.memoType ?? 'MEMO_TEXT';
    if (memoType !== 'MEMO_TEXT') {
      errors.memo = 'The mobile receive flow currently supports text memos only.';
    } else {
      const memoError = validateMemo(trimmedMemo);
      if (memoError) errors.memo = memoError;
    }
  } else if (params.memoType) {
    errors.memo = 'Memo type requires a memo value.';
  }

  const hasAssetCode = Boolean(params.assetCode?.trim());
  const hasAssetIssuer = Boolean(params.assetIssuer?.trim());
  if (hasAssetCode !== hasAssetIssuer) {
    errors.asset = 'Asset code and issuer must be provided together.';
  } else if (hasAssetCode && hasAssetIssuer) {
    errors.asset = 'Issued assets are not supported by the current mobile receive flow.';
  }

  return errors;
}

/**
 * Validate and build a receive QR payload as one operation.
 *
 * Invalid inputs deliberately produce no payload so callers cannot accidentally
 * render a QR with rejected fields silently omitted.
 */
export function createReceivePayload(
  params: ReceivePayloadParams,
  network: string = CURRENT_STELLAR_NETWORK,
): ReceivePayloadResult {
  const normalizedParams = {
    ...params,
    destination: params.destination.trim(),
  };
  const errors = validateReceivePayload(normalizedParams, network);
  const isValid = Object.keys(errors).length === 0;

  return {
    payload: isValid ? buildReceivePayload(normalizedParams, TESTNET_NETWORK_PASSPHRASE) : '',
    errors,
    isValid,
  };
}

/**
 * Builds the string to encode in the receive QR code (and to use as the
 * Share/Copy fallback text). Pure formatting - assumes `amount`/`memo` have
 * already passed `validateAmount`/`validateMemo`. A non-public network needs an
 * explicit passphrase; omitting it retains SEP-0007's public-network default.
 */
export function buildReceivePayload(
  params: ReceivePayloadParams,
  networkPassphrase?: string,
): string {
  const { destination, amount, assetCode, assetIssuer, memo, memoType } = params;

  const trimmedAmount = amount?.trim();
  const trimmedMemo = memo?.trim();
  const hasPaymentRequestFields = Boolean(trimmedAmount || trimmedMemo || (assetCode && assetIssuer));

  if (!hasPaymentRequestFields) {
    return destination;
  }

  const query = new URLSearchParams();
  query.set('destination', destination);

  if (networkPassphrase) {
    query.set('network_passphrase', networkPassphrase);
  }

  if (trimmedAmount) {
    query.set('amount', trimmedAmount);
  }

  // SEP-0007 requires asset_code and asset_issuer together; a code with no
  // issuer can't be resolved to a specific asset, so it's dropped silently
  // rather than emitting an invalid/ambiguous payload.
  if (assetCode && assetIssuer) {
    query.set('asset_code', assetCode);
    query.set('asset_issuer', assetIssuer);
  }

  if (trimmedMemo) {
    query.set('memo', trimmedMemo);
    query.set('memo_type', memoType ?? 'MEMO_TEXT');
  }

  return `${STELLAR_PAY_URI_PREFIX}?${query.toString()}`;
}

/** True when `payload` is a payment-request URI rather than a bare address. */
export function isPaymentRequestPayload(payload: string): boolean {
  return payload.startsWith(STELLAR_PAY_URI_PREFIX);
}
