import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAppStore } from '../src/store/appStore';
import { useWalletStore } from '../src/store/walletStore';
import { validateSigningConfirmationRequest } from '../src/utils/signingConfirmation';
import { SIZES, RADIUS, ThemeColors } from '../src/constants/theme';
import { formatAmount } from '../src/utils/amount';
import { resolveAddressLabel } from '../src/utils/contacts';
import { truncateAddress } from '../src/utils/contacts';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react-native';
import { AsyncActionButton, Button, ScreenHeader } from '@/components';
import { useConfirm } from '../src/hooks/useConfirm';

const getNetworkLabel = (): string => {
  const network = (process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'TESTNET').toUpperCase();
  if (network === 'PUBLIC' || network === 'MAINNET') return 'Public Network';
  if (network === 'TESTNET') return 'Testnet';
  return network;
};

/**
 * Signing Confirmation Screen
 *
 * This screen appears AFTER transaction review and BEFORE actual signing.
 * It provides a final confirmation step that:
 * - Shows a clear summary of what will be signed
 * - Explains the implications of signing
 * - Hides sensitive transaction internals (XDR, sequence numbers)
 * - Gives users a clear "last chance to cancel" moment
 * - Separates "approval to sign" from "transaction execution"
 */
export default function SignConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    source?: string;
    destination?: string;
    amount?: string;
    assetCode?: string;
    memo?: string;
    fee?: string;
    network?: string;
  }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const contacts = useAppStore((state) => state.contacts);
  const publicKey = useWalletStore((state) => state.publicKey);
  const balance = useWalletStore((state) => state.balance);
  const { confirm, confirmationDialog } = useConfirm();
  const [isProcessing, setIsProcessing] = useState(false);

  // Route parameters are display hints, not signer authority. A deep link, an
  // old review, or a wallet switch must not approve a different payment.
  const validation = validateSigningConfirmationRequest(params, {
    publicKey,
    balance,
    network: getNetworkLabel(),
  });
  const source = validation.ok ? validation.values.source : '';
  const destination = validation.ok ? validation.values.destination : '';
  const amount = validation.ok ? validation.values.amount : '';
  const assetCode = 'XLM';
  const memo = validation.ok ? validation.values.memo : '';
  const network = getNetworkLabel();
  // Never display route-supplied fee as fact: review-transaction fetches
  // the network base fee just before signing.
  const fee = 'Calculated at signing';

  const destinationContact = destination.trim()
    ? resolveAddressLabel(destination.trim(), contacts)
    : null;

  const handleCancel = () => {
    void confirm({
      title: 'Cancel Signing',
      message:
        'Are you sure you want to cancel? The transaction will not be signed or sent.',
      confirmLabel: 'Cancel',
      cancelLabel: 'Keep Reviewing',
      destructive: true,
      // Navigate back to send screen, clearing the flow
      onConfirm: () => router.replace('/(tabs)'),
    });
  };

  const handleConfirmSigning = async () => {
    if (isProcessing) return;

    // Check the live store again at the moment of approval. A wallet switch
    // between render and tap must never use the previously displayed consent.
    const currentWallet = useWalletStore.getState();
    const checked = validateSigningConfirmationRequest(params, {
      publicKey: currentWallet.publicKey,
      balance: currentWallet.balance,
      network: getNetworkLabel(),
    });
    if (!checked.ok) {
      Alert.alert('Review expired', checked.message);
      return;
    }

    setIsProcessing(true);

    try {
      // The next screen independently reviews and explicitly signs the
      // verified XLM payment. No signature is produced on this route.
      router.push({
        pathname: '/review-transaction',
        params: {
          destination: checked.values.destination,
          amount: checked.values.amount,
          memo: checked.values.memo,
        },
      });
    } catch (error) {
      console.error('Navigation error:', error);
      Alert.alert(
        'Error',
        'Failed to proceed to signing. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Never render unverified route-supplied signing details.
  if (!validation.ok) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ScreenHeader title="Error" showBack />
        <View style={styles.errorCard}>
          <XCircle size={48} color={colors.error} style={styles.errorIcon} />
          <Text style={styles.errorTitle}>Invalid Transaction</Text>
          <Text style={styles.errorMessage}>
            {validation.message}
          </Text>
          <Button
            title="Go Back"
            onPress={() => router.back()}
            style={styles.errorButton}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Confirm Signing" showBack onBack={handleCancel} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Warning Banner */}
        <View style={styles.warningBanner}>
          <AlertTriangle size={20} color={colors.warning} />
          <Text style={styles.warningText}>
            You are about to sign a blockchain transaction. This action cannot be
            undone.
          </Text>
        </View>

        {/* Transaction Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Transaction Summary</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>From</Text>
            <Text style={styles.detailValue}>
              {truncateAddress(source, 6)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>To</Text>
            <View style={styles.detailValueContainer}>
              {destinationContact?.isContact && (
                <Text style={styles.contactLabel}>
                  {destinationContact.label}
                </Text>
              )}
              <Text
                style={[
                  styles.detailValue,
                  destinationContact?.isContact && styles.detailValueSecondary,
                ]}
              >
                {truncateAddress(destination, 6)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={[styles.detailValue, styles.amountValue]}>
              {formatAmount(amount)} {assetCode}
            </Text>
          </View>

          {memo && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Memo</Text>
                <Text style={styles.detailValue} numberOfLines={2}>
                  {memo}
                </Text>
              </View>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Network Fee</Text>
            <Text style={styles.detailValue}>{fee}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Network</Text>
            <Text style={styles.detailValue}>{network}</Text>
          </View>
        </View>

        {/* Security Information Card */}
        <View style={styles.securityCard}>
          <View style={styles.securityHeader}>
            <Shield size={24} color={colors.primary} />
            <Text style={styles.securityTitle}>What Happens Next?</Text>
          </View>

          <View style={styles.securityPoint}>
            <CheckCircle size={16} color={colors.success} />
            <Text style={styles.securityPointText}>
              Your device will sign this transaction using your private key
            </Text>
          </View>

          <View style={styles.securityPoint}>
            <CheckCircle size={16} color={colors.success} />
            <Text style={styles.securityPointText}>
              The signed transaction will be sent to the Stellar network
            </Text>
          </View>

          <View style={styles.securityPoint}>
            <CheckCircle size={16} color={colors.success} />
            <Text style={styles.securityPointText}>
              Once confirmed, the transaction cannot be reversed
            </Text>
          </View>

          <View style={styles.securityPoint}>
            <Shield size={16} color={colors.primary} />
            <Text style={styles.securityPointText}>
              Your private key never leaves this device
            </Text>
          </View>
        </View>

        {/* Privacy Notice */}
        <View style={styles.privacyNotice}>
          <Clock size={16} color={colors.textSecondary} />
          <Text style={styles.privacyText}>
            Technical details like sequence numbers and transaction envelopes are
            hidden for security. Only essential information is shown.
          </Text>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <AsyncActionButton
          title="Cancel"
          onPress={handleCancel}
          variant="secondary"
          style={styles.cancelButton}
          disabled={isProcessing}
        />
        <AsyncActionButton
          title="Sign Transaction"
          loadingText="Processing..."
          onPress={handleConfirmSigning}
          style={styles.confirmButton}
          isLoading={isProcessing}
        />
      </View>

      {confirmationDialog}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: SIZES.lg,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: SIZES.md,
      paddingBottom: SIZES.xl,
    },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.warningBackground || `${colors.warning}20`,
      padding: SIZES.md,
      borderRadius: RADIUS.md,
      marginBottom: SIZES.md,
      gap: SIZES.sm,
    },
    warningText: {
      flex: 1,
      fontSize: 14,
      color: colors.warning,
      fontWeight: '500',
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      padding: SIZES.lg,
      marginBottom: SIZES.md,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: SIZES.md,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: SIZES.sm,
      gap: SIZES.md,
    },
    detailLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500',
      flex: 0,
      minWidth: 80,
    },
    detailValueContainer: {
      flex: 1,
      alignItems: 'flex-end',
    },
    detailValue: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '400',
      textAlign: 'right',
      flex: 1,
    },
    detailValueSecondary: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    contactLabel: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
      marginBottom: 2,
    },
    amountValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: SIZES.xs,
    },
    securityCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      padding: SIZES.lg,
      marginBottom: SIZES.md,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    securityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SIZES.md,
      gap: SIZES.sm,
    },
    securityTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    securityPoint: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: SIZES.sm,
      gap: SIZES.sm,
    },
    securityPointText: {
      flex: 1,
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    privacyNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: SIZES.md,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.md,
      gap: SIZES.sm,
      marginBottom: SIZES.md,
    },
    privacyText: {
      flex: 1,
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
      fontStyle: 'italic',
    },
    actionButtons: {
      flexDirection: 'row',
      padding: SIZES.md,
      gap: SIZES.sm,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cancelButton: {
      flex: 1,
    },
    confirmButton: {
      flex: 2,
    },
    errorCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      padding: SIZES.xl,
      alignItems: 'center',
      maxWidth: 400,
    },
    errorIcon: {
      marginBottom: SIZES.md,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.error,
      marginBottom: SIZES.sm,
      textAlign: 'center',
    },
    errorMessage: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: SIZES.lg,
    },
    errorButton: {
      minWidth: 150,
    },
  });
}
