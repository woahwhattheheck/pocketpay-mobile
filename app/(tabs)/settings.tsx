import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { SIZES, RADIUS, ThemeColors } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useWalletStore } from '../../src/store/walletStore';
import { useAppLockStore } from '../../src/store/appLockStore';
import { Moon, Sun, Shield, Globe, AlertTriangle, Info } from 'lucide-react-native';
import { SecretKeyReveal } from '../../src/components/SecretKeyReveal';
import { WalletResetConfirmModal } from '../../src/components/WalletResetConfirmModal';
import { useNetworkEnvironment } from '../../src/features/settings';
import { FEATURE_FLAGS } from '../../src/config/featureFlags';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { clearWallet, getSecretKey } = useWalletStore();
  const { isLockEnabled, enableLock, disableLock, authenticate } = useAppLockStore();
  const environment = useNetworkEnvironment();
  const featureFlags = Object.entries(FEATURE_FLAGS);
  const enabledExperimentalFlags = featureFlags.filter(
    ([, flag]) => flag.enabled && flag.experimental
  );
  const [showSecret, setShowSecret] = useState(false);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleExportKey = async () => {
    if (!showSecret) {
      const secret = await getSecretKey();
      if (secret) {
        setSecretKey(secret);
        setShowSecret(true);
      }
    } else {
      setShowSecret(false);
      setSecretKey(null);
    }
  };

  const handleSignOut = () => {
    setShowResetModal(true);
  };

  const handleResetConfirm = async () => {
    setIsResetting(true);
    const cleared = await clearWallet();
    setIsResetting(false);
    setShowResetModal(false);
    if (!cleared) {
      Alert.alert('Wallet Not Cleared', 'Failed to clear wallet securely. Please try again.');
    }
  };

  const handleToggleLock = async (enable: boolean) => {
    if (enable) {
      await enableLock();
      await authenticate();
    } else {
      Alert.alert(
        'Disable App Lock',
        'Anyone with your device can access your wallet without app lock. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              await disableLock();
            },
          },
        ]
      );
    }
  };

  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Shield color={colors.primary} size={24} />
                <View style={styles.rowTextGroup}>
                  <Text style={styles.rowText}>App Lock</Text>
                  <Text style={styles.rowHelper}>
                    Require biometrics or passcode to open
                  </Text>
                </View>
              </View>
              <Switch
                value={isLockEnabled}
                onValueChange={handleToggleLock}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                {isDark ? <Moon color={colors.textPrimary} size={24} /> : <Sun color={colors.textPrimary} size={24} />}
                <View style={styles.rowTextGroup}>
                  <Text style={styles.rowText}>Dark Mode</Text>
                  <Text style={styles.rowHelper}>Currently using {isDark ? 'dark' : 'light'} theme</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Environment</Text>
          <View style={styles.card}>
            <View style={styles.row} testID="settings-network-row">
              <View style={styles.rowLeft}>
                <Globe color={colors.primary} size={24} />
                <View style={styles.rowTextGroup}>
                  <Text style={styles.rowText}>Network</Text>
                  <Text style={styles.rowHelper}>{environment.networkLabel}</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row} testID="settings-horizon-row">
              <View style={styles.rowLeft}>
                <Info color={colors.textPrimary} size={24} />
                <View style={styles.rowTextGroup}>
                  <Text style={styles.rowText}>Horizon</Text>
                  <Text style={styles.rowHelper}>
                    {environment.horizonHost === '—'
                      ? 'Default endpoint'
                      : environment.horizonHost}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row} testID="settings-vault-capability-row">
              <View style={styles.rowLeft}>
                <Shield color={colors.textPrimary} size={24} />
                <View style={styles.rowTextGroup}>
                  <Text style={styles.rowText}>Vault capability</Text>
                  <Text style={styles.rowHelper}>
                    {environment.vaultMode === 'configured'
                      ? `Configured · ${environment.vaultContractLabel}`
                      : 'Mock mode · no on-chain vault contract'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {environment.warnings.map((warning) => {
            const warningColor =
              warning.severity === 'error'
                ? colors.error
                : warning.severity === 'warning'
                ? colors.warning
                : colors.primary;
            return (
              <View
                key={warning.title}
                style={[styles.warningCard, { borderColor: warningColor }]}
                accessibilityRole="alert"
              >
                <AlertTriangle color={warningColor} size={18} />
                <View style={styles.warningTextGroup}>
                  <Text style={[styles.warningTitle, { color: warningColor }]}>
                    {warning.title}
                  </Text>
                  <Text style={styles.warningText}>{warning.message}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management</Text>
          <View style={styles.card}>
            <Button
              title="Address Book / Contacts"
              variant="outline"
              onPress={() => router.push('/contacts')}
              style={styles.menuButton}
            />
            <Button
              title={showSecret ? "Hide Export Menu" : "Export Secret Key"}
              variant="outline"
              onPress={handleExportKey}
              style={styles.menuButton}
            />
            {showSecret && secretKey && (
              <View style={{ padding: SIZES.lg, paddingTop: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, marginBottom: SIZES.sm, fontSize: 14 }}>
                  Your secret key is highly sensitive. Proceed with caution.
                </Text>
                <SecretKeyReveal secretKey={secretKey} />
              </View>
            )}
          </View>
        </View>

        {__DEV__ && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Developer</Text>
            <View style={styles.card}>
              <View style={styles.row} testID="settings-diagnostics-visibility-row">
                <View style={styles.rowLeft}>
                  <Info color={colors.primary} size={24} />
                  <View style={styles.rowTextGroup}>
                    <Text style={styles.rowText}>Diagnostics</Text>
                    <Text style={styles.rowHelper}>
                      Available in development builds; exports are redacted.
                    </Text>
                  </View>
                </View>
              </View>

              <Button
                title="App Diagnostics"
                variant="outline"
                onPress={() => router.push('/diagnostics')}
                style={styles.menuButton}
              />

              <View style={styles.divider} />

              <Text style={styles.subsectionTitle}>Feature flags</Text>
              {featureFlags.map(([key, flag], index) => (
                <React.Fragment key={key}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <View style={styles.flagRow} testID={`settings-feature-${key}`}>
                    <View style={styles.flagTextGroup}>
                      <Text style={styles.rowText}>
                        {key
                          .replace(/^(ENABLE_|SHOW_)/, '')
                          .split('_')
                          .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
                          .join(' ')}
                      </Text>
                      <Text style={styles.rowHelper}>{flag.description}</Text>
                    </View>
                    <View style={styles.flagStateGroup}>
                      <Text
                        style={[
                          styles.flagState,
                          { color: flag.enabled ? colors.success : colors.textMuted },
                        ]}
                      >
                        {flag.enabled ? 'Enabled' : 'Disabled'}
                      </Text>
                      {flag.experimental ? (
                        <Text style={[styles.experimentalLabel, { color: colors.warning }]}>
                          Experimental
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </View>

            {enabledExperimentalFlags.length > 0 ? (
              <View
                style={[styles.warningCard, { borderColor: colors.warning }]}
                accessibilityRole="alert"
                testID="settings-experimental-warning"
              >
                <AlertTriangle color={colors.warning} size={18} />
                <View style={styles.warningTextGroup}>
                  <Text style={[styles.warningTitle, { color: colors.warning }]}>
                    Experimental features enabled
                  </Text>
                  <Text style={styles.warningText}>
                    {enabledExperimentalFlags
                      .map(([key]) => key.replace(/^(ENABLE_|SHOW_)/, '').replace(/_/g, ' '))
                      .join(', ')}
                    {' '}may change behavior between builds. Verify the active network and capability state before testing.
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        )}

        <View style={[styles.section, { marginTop: SIZES.xl }]}>
          <Button
            title="Sign Out & Clear Wallet"
            variant="destructive"
            onPress={handleSignOut}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Stellar PocketPay v1.0.0</Text>
          <Text style={styles.footerText}>Network: {environment.networkLabel}</Text>
        </View>
      </ScrollView>
      <WalletResetConfirmModal
        visible={showResetModal}
        isLoading={isResetting}
        onConfirm={handleResetConfirm}
        onCancel={() => setShowResetModal(false)}
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: SIZES.lg,
  },
  section: {
    marginBottom: SIZES.xl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: SIZES.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SIZES.lg,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowTextGroup: {
    marginLeft: SIZES.md,
    flex: 1,
  },
  rowText: {
    color: colors.textPrimary,
    fontSize: 16,
  },
  rowHelper: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: SIZES.lg,
  },
  menuButton: {
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRadius: 0,
    justifyContent: 'flex-start',
    paddingHorizontal: SIZES.lg,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: SIZES.sm,
    padding: SIZES.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    backgroundColor: colors.surface,
  },
  warningTextGroup: {
    flex: 1,
    marginLeft: SIZES.sm,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  warningText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  subsectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: SIZES.lg,
    paddingTop: SIZES.lg,
    paddingBottom: SIZES.sm,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SIZES.lg,
  },
  flagTextGroup: {
    flex: 1,
    marginRight: SIZES.md,
  },
  flagStateGroup: {
    alignItems: 'flex-end',
  },
  flagState: {
    fontSize: 13,
    fontWeight: '700',
  },
  experimentalLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    marginTop: SIZES.xl,
    paddingBottom: SIZES.xxl * 2,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
});
