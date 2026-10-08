import React, { useMemo } from 'react';
import { Linking, Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CircleCheck, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../hooks/useTheme';
import { SIZES, RADIUS, ThemeColors } from '../constants/theme';
import type { VaultReceiptAction, VaultReceiptState } from '../features/vault/receiptModel';

export interface VaultReceiptModalProps {
  visible: boolean;
  actionType: VaultReceiptAction;
  amount: string;
  status: VaultReceiptState;
  date: string;
  transactionHash?: string | null;
  explorerUrl?: string | null;
  simulated?: boolean;
  guidance: string;
  onClose: () => void;
}

const ACTION_NAMES: Record<VaultReceiptAction, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  lock: 'Lock creation',
  unlock: 'Matured-lock withdrawal',
};

export const VaultReceiptModal = ({
  visible,
  actionType,
  amount,
  status,
  date,
  transactionHash,
  explorerUrl,
  simulated = false,
  guidance,
  onClose,
}: VaultReceiptModalProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusColor = status === 'confirmed' ? colors.success : status === 'pending' ? colors.warning : colors.error;
  const statusText = status === 'confirmed' ? 'Completed' : status === 'pending' ? 'Pending / unknown' : 'Failed';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {status === 'confirmed'
            ? <CircleCheck color={statusColor} size={54} />
            : <AlertTriangle color={statusColor} size={54} />}

          <Text style={styles.title}>{simulated ? 'Vault Preview' : 'Vault Transaction'}</Text>
          {simulated && <Text style={styles.preview}>Local only — no on-chain transaction</Text>}

          <View style={styles.row}>
            <Text style={styles.label}>Action</Text>
            <Text style={styles.value}>{ACTION_NAMES[actionType]}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Amount</Text>
            <Text style={styles.value}>{amount ? amount + ' XLM' : 'Unavailable'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Text style={[styles.value, { color: statusColor }]}>{statusText}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{date}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Transaction hash</Text>
            <Text style={styles.hash} numberOfLines={1} selectable>
              {transactionHash ?? 'Unavailable'}
            </Text>
          </View>
          <Text style={styles.guidance}>{guidance}</Text>
          {!!explorerUrl && !simulated && (
            <TouchableOpacity
              accessibilityRole="link"
              accessibilityLabel="View vault transaction in explorer"
              onPress={() => void Linking.openURL(explorerUrl).catch(() => {})}
              style={styles.link}
            >
              <Text style={styles.linkText}>View transaction in explorer</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', padding: SIZES.lg,
  },
  card: {
    width: '100%', borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface,
    padding: SIZES.lg, alignItems: 'center',
  },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginVertical: SIZES.md },
  preview: { color: colors.warning, fontSize: 12, textAlign: 'center', marginBottom: SIZES.md },
  row: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 },
  label: { color: colors.textSecondary, fontWeight: '600', flexShrink: 1 },
  value: { color: colors.textPrimary, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  hash: { color: colors.textPrimary, flex: 1, textAlign: 'right', marginLeft: 10 },
  guidance: { color: colors.textSecondary, textAlign: 'center', fontSize: 13, marginTop: SIZES.md },
  link: { marginTop: SIZES.md, padding: SIZES.sm },
  linkText: { color: colors.primary, fontWeight: '600' },
  button: {
    backgroundColor: colors.primary, marginTop: SIZES.lg, paddingVertical: 12,
    paddingHorizontal: 40, borderRadius: RADIUS.md,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
