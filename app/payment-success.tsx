import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle, Copy, Check, ExternalLink, Clock, XCircle, AlertCircle } from 'lucide-react-native';
import { Button } from '../src/components/Button';
import { COLORS, SIZES, RADIUS } from '../src/constants/theme';
import { getExplorerTxUrl } from '../src/services/stellar';
import { useAppStore } from '../src/store/appStore';
import { resolveAddressLabel } from '../src/utils/contacts';
import { useCopyToClipboard } from '../src/utils/clipboard';
import {
  canOpenReceiptExplorer,
  formatReceiptAmount,
  readReceiptParams,
  RECEIPT_COPY,
  type ReceiptRouteParams,
} from '../src/features/transactions/receipt';

/** Also serves the legacy /payment-success route; its name is not proof of success. */
export default function PaymentReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<ReceiptRouteParams>();
  const receipt = readReceiptParams(params);
  const contacts = useAppStore((state) => state.contacts);
  const { copy, copiedField } = useCopyToClipboard();
  const status = RECEIPT_COPY[receipt.status];
  const statusColor = status.tone === 'success' ? COLORS.success
    : status.tone === 'error' ? COLORS.error
    : status.tone === 'warning' ? COLORS.warning : COLORS.textSecondary;
  const StatusIcon = receipt.status === 'successful' ? CheckCircle
    : receipt.status === 'pending' ? Clock
    : receipt.status === 'unknown' ? AlertCircle : XCircle;
  const configuredNetwork = process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'TESTNET';
  const explorerUrl = canOpenReceiptExplorer(receipt, configuredNetwork)
    ? getExplorerTxUrl(receipt.hash) : null;
  const destinationLabel = receipt.destination
    ? resolveAddressLabel(receipt.destination, contacts) : null;
  const formattedDate = receipt.date ? new Date(receipt.date).toLocaleString() : 'Unavailable';

  const handleCopyHash = async () => {
    if (!receipt.hash) return;
    const result = await copy(receipt.hash, 'hash');
    if (!result.ok) Alert.alert('Copy Failed', 'Failed to copy the transaction hash. Please try again.');
  };

  const handleOpenExplorer = async () => {
    if (!explorerUrl) return;
    try {
      if (!(await Linking.canOpenURL(explorerUrl))) {
        Alert.alert('Explorer Unavailable', 'Unable to open the explorer on this device.');
        return;
      }
      await Linking.openURL(explorerUrl);
    } catch {
      Alert.alert('Explorer Unavailable', 'Unable to open the explorer. Please try again.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="receipt-screen">
      <View style={styles.statusIcon}>
        <StatusIcon color={statusColor} size={72} />
      </View>
      <Text style={styles.title}>{status.title}</Text>
      <Text style={[styles.statusLabel, { color: statusColor }]} testID="receipt-status" accessibilityLiveRegion="polite">
        {status.label}
      </Text>
      <Text style={styles.subtitle}>{status.description}</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Amount</Text>
          <Text style={styles.amountValue}>{formatReceiptAmount(receipt)}</Text>
        </View>
        <View style={styles.divider} />
        <Text style={styles.rowLabel}>Recorded at</Text>
        <Text style={styles.addressValue}>{formattedDate}</Text>
        <View style={styles.divider} />
        <Text style={styles.rowLabel}>Network</Text>
        <Text style={styles.addressValue}>{receipt.network || 'Unavailable'}</Text>
        <View style={styles.divider} />
        <Text style={styles.rowLabel}>
          To{destinationLabel?.isContact ? ` · ${destinationLabel.label}` : ''}
        </Text>
        <Text style={styles.addressValue} selectable>
          {receipt.destination || 'Unavailable'}
        </Text>
        <View style={styles.divider} />
        <Text style={styles.rowLabel}>Transaction Hash</Text>
        <View style={styles.hashRow}>
          <Text style={styles.hashValue} selectable>
            {receipt.hash || 'Unavailable'}
          </Text>
          {receipt.hash ? (
            <TouchableOpacity
              onPress={handleCopyHash}
              accessibilityLabel="Copy transaction hash"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {copiedField === 'hash' ? <Check color={COLORS.success} size={20} />
                : <Copy color={COLORS.textSecondary} size={20} />}
            </TouchableOpacity>
          ) : null}
        </View>
        {explorerUrl ? (
          <TouchableOpacity
            style={styles.explorerLink}
            onPress={handleOpenExplorer}
            accessibilityLabel="View transaction on Stellar Expert"
            accessibilityRole="link"
          >
            <Text style={styles.explorerLinkText}>View on Stellar Expert</Text>
            <ExternalLink color={COLORS.primary} size={16} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.explorerHint}>
            {!receipt.hash ? 'No transaction hash is available.'
              : 'Explorer unavailable: the receipt must have a supported network matching this app.'}
          </Text>
        )}
      </View>
      <Text style={styles.subtitle}>
        This is a snapshot of the reported outcome, not independent proof of settlement. Check activity for updates.
      </Text>
      <View style={styles.actions}>
        <Button title="Back to Wallet" onPress={() => router.replace('/(tabs)')} style={styles.actionButton} />
        <Button title="View Activity" variant="outline" onPress={() => router.replace('/(tabs)/history')} style={styles.actionButton} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SIZES.xl, paddingBottom: SIZES.xxl, alignItems: 'center' },
  statusIcon: { marginTop: SIZES.xl, marginBottom: SIZES.md },
  title: { fontSize: 26, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: SIZES.xs, textAlign: 'center' },
  statusLabel: { fontSize: 16, fontWeight: '600', marginBottom: SIZES.sm },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SIZES.xl, lineHeight: 20 },
  card: { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SIZES.xl, borderWidth: 1, borderColor: COLORS.border, marginBottom: SIZES.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SIZES.sm },
  rowLabel: { color: COLORS.textSecondary, fontSize: 13, marginBottom: SIZES.xs },
  amountValue: { color: COLORS.textPrimary, fontSize: 22, fontWeight: 'bold', flexShrink: 1 },
  addressValue: { color: COLORS.textPrimary, fontSize: 14 },
  hashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.sm },
  hashValue: { color: COLORS.textPrimary, fontSize: 14, flex: 1 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SIZES.md },
  explorerLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIZES.xs, marginTop: SIZES.lg, paddingVertical: SIZES.sm },
  explorerLinkText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  explorerHint: { color: COLORS.textSecondary, fontSize: 13, marginTop: SIZES.md, lineHeight: 18 },
  actions: { width: '100%', gap: SIZES.sm },
  actionButton: { width: '100%' },
});
