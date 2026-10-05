import React from 'react';
import { View, Text } from 'react-native';
import { Button } from './Button';
import { SIZES } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { BalanceRefreshState, describeBalanceRefresh } from '../types/balanceRefresh';

interface Props {
  state: BalanceRefreshState;
  onRetry: () => void;
}

export function BalanceRefreshFeedback({ state, onRetry }: Props) {
  const { colors } = useTheme();
  const busy = state.status === 'loading';
  const offline = state.status === 'offline';
  return (
    <View style={{ marginBottom: SIZES.lg, gap: SIZES.sm }}>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: colors.textSecondary }}
      >
        {describeBalanceRefresh(state)}
      </Text>
      <Button
        title={busy ? 'Refreshing balance…' : offline ? 'Reconnect to refresh' : 'Refresh balance'}
        onPress={onRetry}
        disabled={busy || offline}
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Refreshing balance' : offline ? 'Reconnect to refresh balance' : 'Refresh balance'}
        accessibilityState={{ disabled: busy || offline, busy }}
        variant="secondary"
      />
    </View>
  );
}
