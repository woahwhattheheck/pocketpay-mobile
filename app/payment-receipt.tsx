/**
 * Outcome-aware public transaction receipt (#522).
 * This is display-only: it never signs, retries or broadcasts a payment.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { CheckCircle, Clock, AlertTriangle, XCircle, ExternalLink, Copy, Check } from 'lucide-react-native';
import { Button } from '../src/components/Button';
import { COLORS, SIZES, RADIUS } from '../src/constants/theme';
import { getExplorerTxUrl } from '../src/services/stellar';
import { useAppStore } from '../src/store/appStore';
import { resolveAddressLabel } from '../src/utils/contacts';
import { buildTypedReceipt, type ReceiptOutcome } from '../src/features/transactions/receipt';

const toneColor: Record<ReceiptOutcome, string> = {
  success: COLORS.success,
  pending: COLORS.primary,
  failed: COLORS.error,
  rejected: COLORS.warning,
  unknown: COLORS.warning,
};

export default function PaymentReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    status?: string;
    hash?: string;
    amount?: string;
    recipient?: string;
    destination?: string;
    asset?: string;
    timestamp?: string;
    date?: string;
  }>();
  const contacts = useAppStore((state) => state.contacts);
  const [copied, setCopied] = useState(false);
  const explorerUrl = getExplorerTxUrl(params.hash);
  const receipt = useMemo(() => buildTypedReceipt({
    outcome: params.status,
    hash: params.hash,
    amount: params.amount,
    destination: params.recipient || params.destination,
    asset: params.asset,
    date: params.timestamp || params.date,
    explorerUrl,
  }), [
    params.status, params.hash, params.amount, params.recipient,
    params.destination, params.asset, params.timestamp, params.date, explorerUrl,
  ]);

  const contact = receipt.displayDestination !== '—'
    ? resolveAddressLabel(receipt.displayDestination, contacts)
    : null;
  const color = toneColor[receipt.outcome];
  const StatusIcon = receipt.outcome === 'success' ? CheckCircle
    : receipt.outcome === 'pending' ? Clock
    : receipt.outcome === 'failed' ? XCircle : AlertTriangle;

  const onCopyHash = async () => {
    if (!receipt.fullHash) return;
    try {
      await Clipboard.setStringAsync(receipt.fullHash);
      setCopied(true);
    } catch {
      Alert.alert('Copy unavailable', 'Could not copy the transaction hash.');
    }
  };

  const onOpenExplorer = async () => {
    if (!receipt.explorerUrl) return;
    try {
      if (!(await Linking.canOpenURL(receipt.explorerUrl))) {
        Alert.alert('Explorer unavailable', 'Cannot open an explorer on this device.');
        return;
      }
      await Linking.openURL(receipt.explorerUrl);
    } catch {
      Alert.alert('Explorer unavailable', 'Unable to open this transaction on the network explorer.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="transaction-receipt-screen"
    >
      <View style={styles.hero} accessibilityRole="header">
        <StatusIcon color={color} size={52} />
        <Text style={[styles.title, { color }]} testID="receipt-outcome">
          {receipt.outcomeCopy.title}
        </Text>
        <Text style={styles.description}>{receipt.outcomeCopy.description}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={[styles.value, { color }]}>{receipt.outcome.toUpperCase()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Amount</Text>
          <Text style={styles.value}>{receipt.displayValue}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Asset</Text>
          <Text style={styles.value}>{receipt.displayAsset}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Timestamp</Text>
          <Text style={styles.value}>{receipt.displayDate}</Text>
        </View>

        <Text style={styles.label}>
          Recipient{contact?.isContact ? ` · ${contact.label}` : ''}
        </Text>
        <Text style={styles.address} selectable numberOfLines={2}>
          {receipt.displayDestination}
        </Text>

        <Text style={styles.label}>Transaction hash</Text>
        <View style={styles.hashRow}>
          <Text style={styles.hashValue} selectable>{receipt.displayHash}</Text>
          {receipt.canCopyHash && (
            <TouchableOpacity
              onPress={onCopyHash}
              accessibilityRole="button"
              accessibilityLabel="Copy receipt transaction hash"
              testID="receipt-copy-hash"
            >
              {copied
                ? <Check size={18} color={COLORS.success} />
                : <Copy size={18} color={COLORS.primary} />}
            </TouchableOpacity>
          )}
        </View>

        {receipt.hasExplorerLink && (
          <TouchableOpacity
            style={styles.explorerButton}
            onPress={onOpenExplorer}
            accessibilityRole="link"
            accessibilityLabel="Open transaction on Stellar explorer"
            testID="receipt-explorer-link"
          >
            <ExternalLink color={COLORS.primary} size={18} />
            <Text style={styles.explorerText}>View on Stellar Explorer</Text>
          </TouchableOpacity>
        )}
      </View>

      {receipt.outcome !== 'success' && (
        <Text style={styles.safetyNotice}>
          This receipt does not prove that funds moved. Check your wallet activity
          or a network explorer before deciding to submit another payment.
        </Text>
      )}
      <View style={styles.actions}>
        <Button title="Back to Wallet" onPress={() => router.replace('/(tabs)')} />
        <Button title="View Activity" variant="outline" onPress={() => router.replace('/(tabs)/history')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SIZES.lg, paddingBottom: SIZES.xxl },
  hero: { alignItems: 'center', marginVertical: SIZES.lg, gap: SIZES.sm },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  description: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: COLORS.surface, borderColor: COLORS.border,
    borderWidth: 1, borderRadius: RADIUS.lg, padding: SIZES.lg, gap: SIZES.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SIZES.md },
  label: { color: COLORS.textSecondary, fontSize: 13 },
  value: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  address: { color: COLORS.textPrimary, fontSize: 12, lineHeight: 18, marginTop: -8 },
  hashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hashValue: { color: COLORS.textPrimary, fontSize: 12, flex: 1 },
  explorerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SIZES.sm, borderColor: COLORS.primary, borderWidth: 1,
    borderRadius: RADIUS.md, padding: SIZES.md,
  },
  explorerText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  safetyNotice: {
    color: COLORS.warning, fontSize: 12, marginVertical: SIZES.md, lineHeight: 18,
  },
  actions: { gap: SIZES.sm, marginTop: SIZES.lg },
});
