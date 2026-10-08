/**
 * Issue #388: the signing-consent route is display-only, not a transaction
 * authority. Trust only the active signer, configured network and XLM send
 * semantics of /review-transaction; never trust route fee, source or asset.
 */
import { validateAddress, validateAmount, validateMemo } from '../../utils/validation';

export interface SigningConsentRoute {
  source?: unknown;
  destination?: unknown;
  amount?: unknown;
  assetCode?: unknown;
  memo?: unknown;
  fee?: unknown;
  network?: unknown;
}

export interface SigningWalletSnapshot {
  publicKey: string | null;
  balance: string;
}

export interface SigningConsentValues {
  source: string;
  destination: string;
  amount: string;
  assetCode: 'XLM';
  memo: string;
  network: string;
}

export type SigningConsentResult =
  | { ok: true; message: ''; values: SigningConsentValues }
  | { ok: false; message: string; values: SigningConsentValues };

function scalar(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

/** The send path uses the same network setting as actual XLM signing. */
export function activeSigningNetworkLabel(): string | null {
  const configured = (process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'TESTNET').toUpperCase();
  if (configured === 'TESTNET') return 'Testnet';
  if (configured === 'PUBLIC' || configured === 'MAINNET') return 'Public Network';
  return null;
}

/**
 * Returns a normalized public summary and a safe reason for rejection.
 * This runs on render AND immediately before leaving the consent screen.
 * A later signer must still independently revalidate its own live request.
 */
export function validateSigningConsent(
  route: SigningConsentRoute,
  wallet: SigningWalletSnapshot,
): SigningConsentResult {
  const source = scalar(route.source) || '';
  const destination = scalar(route.destination) || '';
  const amount = scalar(route.amount) || '';
  const memo = route.memo === undefined ? '' : scalar(route.memo);
  const requestedAsset = scalar(route.assetCode);
  const requestedNetwork = scalar(route.network);
  const actualNetwork = activeSigningNetworkLabel();
  // Never expose the supplied fee: /review-transaction obtains a fresh base
  // fee from Horizon immediately before its own signing confirmation.
  const values: SigningConsentValues = {
    source,
    destination,
    amount,
    memo: memo || '',
    assetCode: 'XLM',
    network: actualNetwork || 'Unavailable',
  };
  const reject = (message: string): SigningConsentResult => ({ ok: false, message, values });

  if (!wallet.publicKey || source !== wallet.publicKey) {
    return reject('Your active wallet changed or is unavailable. Return to Send and review again.');
  }
  if (!actualNetwork || !requestedNetwork || requestedNetwork !== actualNetwork) {
    return reject('The signing network differs from the requested network. Return to Send and review again.');
  }
  if (requestedAsset !== 'XLM') {
    return reject('This signing path supports native XLM only. Return to Send to choose a supported payment.');
  }
  const destinationError = validateAddress(destination, wallet.publicKey);
  if (destinationError) return reject(destinationError);

  // Never approve an amount from a stale or malformed wallet balance.
  if (!/^\d+(?:\.\d{1,7})?$/.test(wallet.balance)) {
    return reject('Wallet balance is unavailable. Refresh the wallet before sending.');
  }
  const amountError = validateAmount(amount, wallet.balance);
  if (amountError) return reject(amountError);
  if (memo === null) return reject('Invalid memo parameters. Return to Send and review again.');
  const memoError = validateMemo(memo);
  if (memoError) return reject(memoError);
  return { ok: true, message: '', values };
}
