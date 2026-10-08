import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RefreshCw, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../constants/theme';
import {
  describeBalanceRefresh,
  type BalanceRefreshState,
} from '../types/balanceRefresh';

interface Props {
  state: BalanceRefreshState;
  lastRefreshed: number | null;
  isRetrying: boolean;
  onRetry: () => void;
}

/** Visible feedback without exposing raw Horizon error or wallet secrets. */
export function BalanceRefreshStatus({
  state, lastRefreshed, isRetrying, onRetry,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const copy = describeBalanceRefresh(state);

  // The balance card already owns the first-load spinner.
  if (state === 'idle' || (state === 'loading' && lastRefreshed === null)) {
    return null;
  }
  const isWarning = state === 'stale' || state === 'failed' || state === 'offline';
  const canRetry = copy.canRetry && !isRetrying;
  const timestamp = lastRefreshed == null
    ? null
    : new Date(lastRefreshed).toLocaleTimeString();

  return (
    <View
      style={[styles.banner, isWarning && styles.warning]}
      accessibilityRole={isWarning ? 'alert' : 'text'}
      testID="balance-refresh-status"
    >
      <View style={styles.header}>
        {isWarning
          ? <AlertTriangle color={colors.warning} size={16} />
          : <RefreshCw color={colors.textMuted} size={16} />}
        <Text style={[styles.title, isWarning && styles.warningText]}>
          {copy.title}
        </Text>
      </View>
      <Text style={styles.message}>{copy.message}</Text>
      {timestamp && (
        <Text style={styles.timestamp}>Last verified: {timestamp}</Text>
      )}
      {copy.canRetry && (
        <TouchableOpacity
          onPress={onRetry}
          disabled={!canRetry}
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel={state === 'offline' ? 'Recheck connection' : 'Retry balance refresh'}
          testID="balance-refresh-retry"
        >
          <Text style={styles.retryLabel}>
            {isRetrying ? 'Refreshing…' : state === 'offline' ? 'Check connection' : 'Refresh balance'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  banner: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  warning: { borderColor: colors.warning },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  warningText: { color: colors.warning },
  message: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
  timestamp: { color: colors.textMuted, fontSize: 11, marginTop: 5 },
  retry: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 8 },
  retryLabel: { color: colors.primary, fontSize: 13, fontWeight: '600' },
});
