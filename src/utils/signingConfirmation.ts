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
  network: string;
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

  if (!wallet.publicKey || !source || source !== wallet.publicKey.trim()) {
    return { ok: false, message: 'The signing request does not match your active wallet. Start the payment again.' };
  }
  if (!network || network !== wallet.network) {
    return { ok: false, message: 'The requested network does not match the active network. Start the payment again.' };
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
