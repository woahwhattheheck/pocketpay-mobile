/**
 * Labels the network used to SIGN transactions, not an untrusted route param.
 *
 * The payment service defaults its signing passphrase to Stellar Testnet when
 * EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE is absent. Keep that default here, so
 * a mismatched display-only network alias cannot misrepresent the transaction.
 * This is configuration information, not a live Horizon connectivity check.
 */
import { Networks } from '@stellar/stellar-sdk';

export type PaymentNetworkKind = 'testnet' | 'mainnet' | 'custom';

export interface PaymentNetworkInfo {
  kind: PaymentNetworkKind;
  label: string;
  warning: string;
  mismatch: boolean;
}

export interface PaymentNetworkConfig {
  network?: string;
  passphrase?: string;
}

export function getPaymentNetworkInfo(
  config: PaymentNetworkConfig = {},
): PaymentNetworkInfo {
  const selectedNetwork = (
    config.network ?? process.env.EXPO_PUBLIC_STELLAR_NETWORK ?? 'TESTNET'
  ).trim().toUpperCase() || 'TESTNET';

  // Keep the exact fallback used by src/services/stellar.ts::sendXlmTransaction.
  const signingPassphrase =
    (config.passphrase ?? process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE) ||
    Networks.TESTNET;

  const kind: PaymentNetworkKind =
    signingPassphrase === Networks.TESTNET
      ? 'testnet'
      : signingPassphrase === Networks.PUBLIC
        ? 'mainnet'
        : 'custom';

  const label =
    kind === 'testnet' ? 'Testnet' :
    kind === 'mainnet' ? 'Public Network (Mainnet)' :
    'Custom Network';

  const selectedKind: PaymentNetworkKind =
    selectedNetwork === 'TESTNET' ? 'testnet' :
    selectedNetwork === 'MAINNET' || selectedNetwork === 'PUBLIC'
      ? 'mainnet'
      : 'custom';

  const mismatch = selectedKind !== kind;

  const warning = mismatch
    ? 'The network name and signing passphrase disagree. Check the app network configuration before sending.'
    : kind === 'testnet'
      ? 'Testnet uses test assets, not real funds. Confirm the recipient is on Testnet.'
      : kind === 'mainnet'
        ? 'This transaction may transfer real assets. Verify the recipient and amount; confirmed payments cannot be reversed.'
        : 'Custom signing network: verify its passphrase and Horizon endpoint before sending. Public explorers may not support it.';

  return { kind, label, warning, mismatch };
}
