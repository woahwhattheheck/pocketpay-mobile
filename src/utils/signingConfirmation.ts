import { validateAddress, validateAmount, validateMemo } from './validation';

/** A route can be opened with arbitrary or repeated query-string parameters. */
export interface SigningConfirmationParams {
  source?: unknown;
  destination?: unknown;
  amount?: unknown;
  assetCode?: unknown;
  memo?: unknown;
  network?: unknown;
}

export interface ActiveSigningWallet {
  publicKey: string | null;
  balance: string;
  network: string | null;
}

export type VerifiedSigningConfirmation =
  | {
      ok: true;
      values: {
        source: string;
        destination: string;
        amount: string;
        assetCode: 'XLM';
        memo: string;
        network: string;
      };
    }
  | { ok: false; message: string };

const readText = (value: unknown): string | null =>
  typeof value === 'string' ? value.trim() : null;

const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const STELLAR_PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

const normalizeNetworkLabel = (value: unknown): 'Testnet' | 'Public Network' | null => {
  if (typeof value !== 'string') return null;
  switch (value.trim().toUpperCase()) {
    case 'TESTNET':
      return 'Testnet';
    case 'PUBLIC':
    case 'MAINNET':
    case 'PUBLIC NETWORK':
      return 'Public Network';
    default:
      return null;
  }
};

/**
 * Derive the consent network from the exact passphrase used by transaction
 * signing. EXPO_PUBLIC_STELLAR_NETWORK is only a consistency hint: when it is
 * explicitly set, it must agree with the signer passphrase.
 *
 * The signing service falls back to Testnet when its passphrase environment
 * variable is absent or empty, so this helper deliberately mirrors that rule.
 */
export function resolveSigningNetwork(
  configuredNetwork: unknown,
  configuredPassphrase: unknown,
): 'Testnet' | 'Public Network' | null {
  const passphrase =
    typeof configuredPassphrase === 'string' && configuredPassphrase.length > 0
      ? configuredPassphrase
      : STELLAR_TESTNET_PASSPHRASE;

  const actualNetwork =
    passphrase === STELLAR_TESTNET_PASSPHRASE
      ? 'Testnet'
      : passphrase === STELLAR_PUBLIC_PASSPHRASE
        ? 'Public Network'
        : null;

  if (!actualNetwork) return null;

  // An unset/empty display label has no authority. Use the actual signer
  // passphrase. If a label is explicitly configured, require exact agreement.
  if (configuredNetwork === undefined || configuredNetwork === null || configuredNetwork === '') {
    return actualNetwork;
  }
  return normalizeNetworkLabel(configuredNetwork) === actualNetwork ? actualNetwork : null;
}

/**
 * The signer uses the current local wallet, configured Stellar network, and
 * XLM. Validate the entire displayed request against those same authorities.
 * Reject stale/deep-linked values before showing approval or navigating.
 */
export function validateSigningConfirmationRequest(
  route: SigningConfirmationParams,
  wallet: ActiveSigningWallet,
): VerifiedSigningConfirmation {
  const source = readText(route.source);
  const destination = readText(route.destination);
  const amount = readText(route.amount);
  const assetCode = readText(route.assetCode);
  const memo = route.memo === undefined ? '' : readText(route.memo);
  const network = readText(route.network);

  // A value copied out of a stale or malformed wallet store is not signer
  // identity simply because it matches the route parameter.
  if (typeof wallet.publicKey !== 'string' || !source ||
      source !== wallet.publicKey.trim() || validateAddress(source)) {
    return { ok: false, message: 'The signing request does not match your active wallet. Start the payment again.' };
  }
  // Only supported Stellar network labels may be consented to: otherwise an
  // unsupported environment setting could echo a forged matching route value
  // even while the underlying SDK silently selects a different passphrase.
  if ((wallet.network !== 'Testnet' && wallet.network !== 'Public Network') ||
      !network || network !== wallet.network) {
    return { ok: false, message: 'The requested network does not match the active network. Start the payment again.' };
  }
  // Amount validation historically does Number('NaN') and compares against
  // NaN. Both "value > NaN" comparisons are false, a fail-open when the
  // observed spendable balance is corrupt, missing or exceeds XLM precision.
  const rawBalance = wallet.balance;
  if (typeof rawBalance !== 'string' ||
      !/^\d+(?:\.\d{1,7})?$/.test(rawBalance.trim()) ||
      !Number.isFinite(Number(rawBalance)) || Number(rawBalance) < 0) {
    return { ok: false, message: 'Your spendable balance is unavailable. Refresh your wallet before approving.' };
  }
  if (assetCode !== 'XLM') {
    return { ok: false, message: 'This signing flow currently supports only XLM. Start the payment again.' };
  }
  if (!destination || validateAddress(destination, wallet.publicKey)) {
    return { ok: false, message: 'The destination address is invalid. Start the payment again.' };
  }
  if (!amount || !Number.isFinite(Number(amount)) || validateAmount(amount, wallet.balance)) {
    return { ok: false, message: 'The amount is invalid or exceeds the spendable balance. Review the payment again.' };
  }
  if (memo === null || validateMemo(memo)) {
    return { ok: false, message: 'The memo is invalid. Review the payment again.' };
  }
  return {
    ok: true,
    values: { source, destination, amount, assetCode: 'XLM', memo, network },
  };
}
