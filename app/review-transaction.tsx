import React, { useEffect, useMemo, useState } from 'react';
import {
  server,
  sendXlmTransaction,
  checkSubmittedTransaction,
  TransactionSubmissionUnknownError,
  TransactionSubmissionRejectedError,
} from '../src/services/stellar';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useSignerStore } from '../src/store/signerStore';
import { useWalletStore } from '../src/store/walletStore';
import { SIZES, RADIUS, ThemeColors } from '../src/constants/theme';
import { formatAmount } from '../src/utils/amount';
import { resolveAddressLabel } from '../src/utils/contacts';
import { WALLET_SECRET_ACCESS_MESSAGE } from '../src/utils/walletStorageErrors';
import { useAppStore } from '../src/store/appStore';
import {
  ArrowRight,
  Smartphone,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react-native';
import {
  Button,
  LoadingState,
  ReviewConfirm,
  ReviewItem,
  ScreenHeader,
  StatusBadge,
} from '@/components';
import { UNCONFIRMED_SUBMISSION_MESSAGE } from '../src/utils/paymentErrors';

/** Copy for each in-flight signing phase, shared by the visible card and its screen-reader label. */
const PHASE_COPY = {
  handoff: {
    title: 'Preparing Transaction...',
    subtitle: 'Building the transaction for review.',
  },
  signing: {
    title: 'Signing...',
    subtitle: 'Your device is signing the transaction securely.',
  },
  submitting: {
    title: 'Submitting to Network...',
    subtitle: 'Transaction signed. Waiting for network confirmation.',
  },
  confirming: {
    title: 'Confirming...',
    subtitle: 'Network responded. Wrapping up.',
  },
} as const;

type InFlightPhase = keyof typeof PHASE_COPY;

const isInFlightPhase = (phase: string): phase is InFlightPhase => phase in PHASE_COPY;

const getNetworkLabel = (): string => {
  const network = (process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'TESTNET').toUpperCase();
  if (network === 'PUBLIC' || network === 'MAINNET') return 'Public Network';
  if (network === 'TESTNET') return 'Testnet';
  return network;
};

/**
 * Transaction Review Screen
 *
 * Full-screen transaction review before signing. This replaces the modal-based
 * confirmation with a dedicated review surface that:
 * - Shows complete transaction details
 * - Displays the active signer and its security model
 * - Handles all handoff phases (review -> handoff -> signing -> submitting)
 * - Provides cancellation at any point before submission
 * - Handles failure and success states inline
 */
export default function ReviewTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    destination?: string;
    amount?: string;
    memo?: string;
  }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { publicKey, getSecretKey, refreshWalletData, addPendingTransaction } = useWalletStore();
  const contacts = useAppStore((state) => state.contacts);
  const store = useSignerStore();
  const { phase, error } = store;
  const [unknownHash, setUnknownHash] = useState<string | null>(null);
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'checking' | 'not_found' | 'unavailable' | 'rejected'>('idle');
  const [showUnknownDetails, setShowUnknownDetails] = useState(false);

  const destination = params.destination || '';
  const amount = params.amount || '';
  const memo = params.memo || '';

  const destinationContact =
    destination.trim() ? resolveAddressLabel(destination.trim(), contacts) : null;

  // Start the review when the screen mounts
  useEffect(() => {
    if (!destination || !amount || !publicKey) {
      router.back();
      return;
    }
    store.startReview({
      requestId: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      sourcePublicKey: publicKey,
      destinationPublicKey: destination.trim(),
      destinationLabel: destinationContact?.isContact ? destinationContact.label : null,
      amount: amount.trim(),
      assetCode: 'XLM',
      memo: memo.trim() || undefined,
      network: getNetworkLabel(),
      createdAt: new Date().toISOString(),
      timeoutSeconds: 30,
    });
  }, [destination, amount, publicKey]);

  // Handle success - navigate away
  useEffect(() => {
    if (phase === 'completed' && store.lastResult) {
      refreshWalletData();
      const timer = setTimeout(() => {
        store.reset();
        router.replace({
          pathname: '/payment-success',
          params: {
            hash: store.lastResult!.hash,
            amount: amount.trim(),
            destination: destination.trim(),
            date: new Date().toISOString(),
          },
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, store.lastResult]);

  const handleConfirmSign = async () => {
    setUnknownHash(null);
    setLookupStatus('idle');
    setShowUnknownDetails(false);
    try {
      const secretKey = await getSecretKey();
      if (!secretKey) {
        store.failSigning({ type: 'signer_unavailable', message: WALLET_SECRET_ACCESS_MESSAGE });
        return;
      }
      const fee = await server.fetchBaseFee();
      store.startReview({
        requestId: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
        sourcePublicKey: publicKey!,
        destinationPublicKey: destination.trim(),
        destinationLabel: destinationContact?.isContact ? destinationContact.label : null,
        amount: amount.trim(),
        assetCode: 'XLM',
        memo: memo.trim() || undefined,
        network: getNetworkLabel(),
        createdAt: new Date().toISOString(),
        timeoutSeconds: 30,
        fee: fee.toString(),
      });
      store.enterHandoff();
      store.enterSigning();
      store.enterSubmitting();
      const result = await sendXlmTransaction(secretKey, destination.trim(), amount.trim(), memo.trim() || undefined);
      store.enterConfirming();
      addPendingTransaction(result.hash, {
        id: result.hash,
        type: 'payment',
        from: publicKey!,
        to: destination.trim(),
        amount: amount.trim(),
        asset: 'XLM',
        created_at: new Date().toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      store.completeSigning({
        hash: result.hash,
        review: store.currentReview!,
        signerType: 'local',
        completedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      if (err instanceof TransactionSubmissionUnknownError) {
        // The signed hash can be tracked without the signing key and MUST NOT be resent blindly.
        setUnknownHash(err.hash);
        setLookupStatus('idle');
        addPendingTransaction(err.hash, {
          id: err.hash,
          type: 'payment',
          from: publicKey!,
          to: destination.trim(),
          amount: amount.trim(),
          asset: 'XLM',
          created_at: new Date().toISOString(),
        });
        store.failSigning({ type: 'unknown', message: UNCONFIRMED_SUBMISSION_MESSAGE });
        return;
      }
      if (err instanceof TransactionSubmissionRejectedError) {
        store.failSigning({
          type: 'unknown',
          message: 'Network rejected this transaction (' + err.resultCode + ').',
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Could not prepare the transaction.';
      store.failSigning({ type: /cancel/i.test(message) ? 'user_cancelled' : 'unknown', message });
    }
  };

  const handleCheckStatus = async () => {
    if (!unknownHash || lookupStatus === 'checking' || lookupStatus === 'rejected') return;
    setLookupStatus('checking');
    const status = await checkSubmittedTransaction(unknownHash);
    if (status === 'confirmed') {
      store.enterConfirming();
      store.completeSigning({
        hash: unknownHash,
        review: store.currentReview!,
        signerType: 'local',
        completedAt: new Date().toISOString(),
      });
      return;
    }
    // Horizon 404 means "not yet found", not proof of failure.
    setLookupStatus(status);
  };

  const handleCancel = () => {
    store.cancelSigning();
    setTimeout(() => {
      store.reset();
      router.back();
    }, 300);
  };

  const handleRetry = () => {
    store.reset();
  };

  const handleDismissError = () => {
    store.reset();
    router.back();
  };

  const reviewItems: ReviewItem[] = useMemo(() => {
    const items: ReviewItem[] = [
      { label: 'From', value: publicKey ?? '', truncate: true },
      {
        label: 'To',
        value: destinationContact?.isContact ? destinationContact.label : destination.trim(),
        secondaryValue: destinationContact?.isContact ? destination.trim() : null,
        truncate: true,
      },
      { label: 'Amount', value: `${formatAmount(amount.trim())} XLM`, emphasis: true },
    ];

    if (memo.trim()) items.push({ label: 'Memo', value: memo.trim() });
    items.push({ label: 'Network', value: getNetworkLabel() });
    if (store.currentReview?.fee) {
      items.push({ label: 'Fee', value: `~${store.currentReview.fee} stroops` });
    }

    return items;
  }, [publicKey, destination, destinationContact, amount, memo, store.currentReview?.fee]);

  // Only the review phase offers actions; every later phase keeps the same
  // summary on screen so the user can still see what they committed to.
  const isReviewPhase = phase === 'review';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <ScreenHeader title="Review Transaction" subtitle="Verify details before signing" />

      {/* Transaction Details + primary confirmation */}
      <ReviewConfirm
        items={reviewItems}
        confirmLabel={isReviewPhase ? 'Sign & Send' : undefined}
        onConfirm={isReviewPhase ? handleConfirmSign : undefined}
        loadingText="Signing…"
        cancelLabel="Back to Edit"
        onCancel={isReviewPhase ? () => router.back() : undefined}
      />

      {/* Signer Info Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.signerHeader}>
          <Smartphone size={18} color={colors.primary} />
          <Text style={[styles.signerTitle, { color: colors.textPrimary }]}>Signing With</Text>
        </View>
        <View style={styles.signerInfo}>
          <Text style={[styles.signerLabel, { color: colors.primary }]}>This Device</Text>
          <Text style={[styles.signerDescription, { color: colors.textMuted }]}>
            Signed securely on this device using the stored key. Your secret key never
            leaves the device and is not exposed to the network.
          </Text>
        </View>
      </View>

      {/* Phase Indicator */}
      {isInFlightPhase(phase) && (
        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <LoadingState
            message=""
            size="small"
            style={styles.statusSpinner}
            accessibilityLabel={PHASE_COPY[phase].title}
          />
          <View style={styles.statusTextGroup}>
            <View style={styles.statusTitleRow}>
              <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>
                {PHASE_COPY[phase].title}
              </Text>
              <StatusBadge text="Pending" tone="info" />
            </View>
            <Text style={[styles.statusSubtitle, { color: colors.textMuted }]}>
              {PHASE_COPY[phase].subtitle}
            </Text>
          </View>
        </View>
      )}

      {/* Success State */}
      {phase === 'completed' && store.lastResult && (
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.success }]}>
          <CheckCircle size={24} color={colors.success} />
          <View style={styles.statusTextGroup}>
            <View style={styles.statusTitleRow}>
              <Text style={[styles.statusTitle, { color: colors.success }]}>Transaction Confirmed</Text>
              <StatusBadge text="Confirmed" tone="success" />
            </View>
            <Text style={[styles.hashText, { color: colors.textSecondary }]} numberOfLines={1}>
              Hash: {store.lastResult.hash}
            </Text>
          </View>
        </View>
      )}

      {/* Signed but unconfirmed is NOT a failed payment: never offer blind retry. */}
      {phase === 'failed' && error && (
        <View style={[styles.resultCard, {
          backgroundColor: colors.surface,
          borderColor: unknownHash && lookupStatus !== 'rejected' ? colors.warning : colors.error,
        }]}>
          {unknownHash && lookupStatus !== 'rejected'
            ? <AlertTriangle size={24} color={colors.warning} />
            : <XCircle size={24} color={colors.error} />}
          <View style={styles.statusTextGroup}>
            <View style={styles.statusTitleRow}>
              <Text style={[styles.statusTitle, {
                color: unknownHash && lookupStatus !== 'rejected' ? colors.warning : colors.error,
              }]}>
                {unknownHash ? lookupStatus === 'rejected' ? 'Transaction Rejected' : 'Status Unknown' : 'Transaction Failed'}
              </Text>
              <StatusBadge
                text={unknownHash && lookupStatus !== 'rejected' ? 'Unconfirmed' : 'Failed'}
                tone={unknownHash && lookupStatus !== 'rejected' ? 'warning' : 'error'}
              />
            </View>
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              {unknownHash
                ? lookupStatus === 'rejected' ? 'Horizon reported a rejected transaction for this hash.' : UNCONFIRMED_SUBMISSION_MESSAGE
                : error.message}
            </Text>
            {unknownHash && (
              <>
                <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                  Do not resend while the outcome is uncertain. Check the signed hash on the network,
                  review wallet history, or contact support with this PUBLIC hash.
                </Text>
                {lookupStatus === 'not_found' && (
                  <Text style={[styles.errorText, { color: colors.warning }]}>
                    Not yet found on Horizon; this is not proof of failure.
                  </Text>
                )}
                {lookupStatus === 'unavailable' && (
                  <Text style={[styles.errorText, { color: colors.warning }]}>
                    Network lookup unavailable. Check again later.
                  </Text>
                )}
                <Button
                  title={lookupStatus === 'checking' ? 'Checking...' : 'Check Status'}
                  disabled={lookupStatus === 'checking' || lookupStatus === 'rejected'}
                  onPress={handleCheckStatus}
                  style={styles.retryButton}
                />
                <Button
                  title={showUnknownDetails ? 'Hide Details' : 'View Details'}
                  variant="secondary"
                  onPress={() => setShowUnknownDetails((value) => !value)}
                  style={styles.retryButton}
                />
                {showUnknownDetails && (
                  <View>
                    <Text selectable style={[styles.hashText, { color: colors.textSecondary }]}>Hash: {unknownHash}</Text>
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>Network: {getNetworkLabel()}</Text>
                    <Text selectable style={[styles.errorText, { color: colors.textSecondary }]}>Recipient: {destination.trim()}</Text>
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>Amount: {formatAmount(amount.trim())} XLM</Text>
                  </View>
                )}
              </>
            )}
            {!unknownHash && (
              <Button title="Dismiss" variant="secondary" onPress={handleDismissError} style={styles.retryButton} />
            )}
          </View>
        </View>
      )}

      {/* Cancelled State */}
      {phase === 'cancelled' && (
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.warning }]}>
          <AlertTriangle size={24} color={colors.warning} />
          <View style={styles.statusTextGroup}>
            <View style={styles.statusTitleRow}>
              <Text style={[styles.statusTitle, { color: colors.warning }]}>Cancelled</Text>
              <StatusBadge text="Cancelled" tone="warning" />
            </View>
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              Signing was cancelled. No transaction was submitted.
            </Text>
          </View>
        </View>
      )}

      {(phase === 'cancelled' || (phase === 'failed' && !!unknownHash)) && (
        <View style={styles.actions}>
          <Button
            title={unknownHash ? 'Back to Wallet / History' : 'Go Back'}
            variant="secondary"
            onPress={handleDismissError}
          />
        </View>
      )}

      {/* Security Notice */}
      <View style={[styles.securityNotice, { backgroundColor: 'rgba(0, 229, 255, 0.08)' }]}>
        <ArrowRight size={14} color={colors.primary} style={{ marginRight: SIZES.sm }} />
        <Text style={[styles.securityText, { color: colors.textMuted }]}>
          Your secret key is stored securely on this device and is never sent over the network.
          Signing happens locally using device-backed encryption.
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: SIZES.xl,
      paddingBottom: SIZES.xxl,
    },
    card: {
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      padding: SIZES.md,
      marginBottom: SIZES.md,
    },
    signerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SIZES.sm,
      marginBottom: SIZES.sm,
    },
    signerTitle: {
      fontSize: 14,
      fontWeight: '600',
    },
    signerInfo: {
      gap: SIZES.xs,
    },
    signerLabel: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    signerDescription: {
      fontSize: 12,
      lineHeight: 18,
    },
    statusSpinner: {
      padding: 0,
    },
    statusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      padding: SIZES.md,
      marginBottom: SIZES.md,
      gap: SIZES.md,
    },
    resultCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      padding: SIZES.md,
      marginBottom: SIZES.md,
      gap: SIZES.sm,
      flexWrap: 'wrap',
    },
    statusTextGroup: {
      flex: 1,
      gap: 2,
    },
    statusTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SIZES.sm,
    },
    statusTitle: {
      fontSize: 14,
      fontWeight: '600',
    },
    statusSubtitle: {
      fontSize: 12,
      lineHeight: 18,
    },
    hashText: {
      fontSize: 11,
      fontFamily: 'monospace',
    },
    errorText: {
      fontSize: 12,
      lineHeight: 18,
    },
    actions: {
      gap: SIZES.sm,
      marginBottom: SIZES.md,
    },
    retryButton: {
      marginTop: SIZES.sm,
      alignSelf: 'flex-start',
    },
    securityNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderRadius: RADIUS.sm,
      padding: SIZES.sm,
      marginTop: SIZES.sm,
    },
    securityText: {
      fontSize: 11,
      lineHeight: 16,
      flex: 1,
    },
  });
