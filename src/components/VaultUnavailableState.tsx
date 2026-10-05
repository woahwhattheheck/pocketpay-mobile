import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SIZES, RADIUS, ThemeColors } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { XCircle } from 'lucide-react-native';
import {
  VaultUnavailableReason,
  describeUnavailableReason,
  describeVaultReadiness,
  getVaultReadinessState,
} from '../utils/vaultAvailability';
import { Button } from './Button';

export interface VaultUnavailableStateProps {
  reasons: VaultUnavailableReason[];
  onNavigateToSettings?: () => void;
  onRetry?: () => void;
}

export const VaultUnavailableState: React.FC<VaultUnavailableStateProps> = ({
  reasons,
  onNavigateToSettings,
  onRetry,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const displayedReasons: VaultUnavailableReason[] = reasons.length ? reasons : ['sdk-not-ready'];
  const state = getVaultReadinessState(displayedReasons);
  const copy = describeVaultReadiness(state);
  const primaryCopy = describeUnavailableReason(displayedReasons[0]);
  const showSettingsButton = displayedReasons.includes('no-wallet') && onNavigateToSettings;
  // Reloading cannot enable a disabled build or configure a missing contract.
  const showRetryButton = displayedReasons.length === 1 &&
    displayedReasons[0] === 'sdk-not-ready' && onRetry;
  const tone = state === 'planned' || state === 'disabled' ? colors.warning : colors.error;

  return (
    <View
      style={[styles.unavailableCard, { borderColor: tone }]}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={`${copy.title}. ${primaryCopy.title}. ${primaryCopy.message}`}
      accessibilityLiveRegion="polite"
      testID={`vault-readiness-${state}`}
    >
      <XCircle color={tone} size={48} testID="unavailable-icon" />
      <Text style={styles.unavailableTitle}>{copy.title}</Text>
      <Text style={styles.unavailableText}>{copy.message}</Text>

      {displayedReasons.map((reason) => {
        const detail = describeUnavailableReason(reason);
        return (
          <View key={reason} style={styles.unavailableDetail} testID={`reason-detail-${reason}`}>
            <Text style={styles.unavailableDetailLabel}>{detail.title}</Text>
            <Text style={styles.unavailableDetailValue}>{detail.message}</Text>
            {detail.hint ? <Text style={styles.unavailableDetailHint}>{detail.hint}</Text> : null}
          </View>
        );
      })}

      {showSettingsButton ? (
        <Button
          title="Go to Settings"
          onPress={onNavigateToSettings}
          variant="primary"
          style={styles.actionButton}
        />
      ) : null}
      {showRetryButton ? (
        <Button title="Try Again" onPress={onRetry} variant="secondary" style={styles.actionButton} />
      ) : null}
      <Text style={styles.unavailableDocsLink}>
        See docs/vault-readiness.md for current capabilities and limitations.
      </Text>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    unavailableCard: {
      backgroundColor: colors.surface,
      padding: SIZES.xl,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      borderWidth: 1,
      marginBottom: SIZES.xl,
    },
    unavailableTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: SIZES.md,
      marginBottom: SIZES.sm,
    },
    unavailableText: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: SIZES.lg,
    },
    unavailableDetail: {
      backgroundColor: colors.surfaceLight,
      padding: SIZES.md,
      borderRadius: RADIUS.md,
      width: '100%',
      marginBottom: SIZES.sm,
    },
    unavailableDetailLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    unavailableDetailValue: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    unavailableDetailHint: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
    actionButton: {
      marginTop: SIZES.md,
      width: '100%',
      minHeight: 44,
    },
    unavailableDocsLink: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
      marginTop: SIZES.md,
    },
  });
