import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  Share,
} from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { SIZES, RADIUS, ThemeColors } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';
import { getDiagnostics } from '../src/utils/diagnostics';
import { redactSensitiveValue } from '../src/utils/redactSensitive';
import {
  Info,
  Smartphone,
  Globe,
  Server,
  Wallet,
  ShieldCheck,
  AlertCircle,
  ChevronLeft,
} from 'lucide-react-native';

interface DiagnosticItem {
  label: string;
  value: string;
  isSensitive?: boolean;
}

interface DiagnosticSection {
  title: string;
  icon: React.ReactNode;
  items: DiagnosticItem[];
}


/** Only the already-redacted diagnostics snapshot can populate this screen. */
interface DiagnosticsSnapshot {
  environment: {
    platform: string;
    osVersion: string | number;
    appVersion: string;
    isDevelopment: boolean;
  };
  network: {
    label: string;
    tier: string;
    horizonHost: string;
    sorobanHost: string;
    vaultMode: string;
    vaultContractLabel: string;
  };
  featureFlags: Record<string, boolean>;
  storage: { secureStoreAvailable: boolean };
  walletState: {
    hasPublicKey: boolean;
    isBalanceLoaded: boolean;
    lastError: string | null;
    balanceState?: string;
    fundingStatus?: string;
  };
  networkHealth?: {
    classifiedError: string | null;
    hasError: boolean;
  };
  lastReportedError?: {
    source: string;
    name: string;
    message: string;
    isFatal: boolean;
  } | null;
}

export default function DiagnosticsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [loadGeneration, setLoadGeneration] = useState(0);

  useEffect(() => {
    // Never collect or expose diagnostics outside a development build.
    if (!__DEV__) return;

    let active = true;
    const load = async () => {
      try {
        // The builder omits secrets, full URLs, keys and balance amounts.
        // A second redaction at the UI/export boundary is defense in depth.
        const safe = redactSensitiveValue(JSON.parse(await getDiagnostics())) as DiagnosticsSnapshot;
        if (!safe || !safe.environment || !safe.network || !safe.storage ||
            !safe.walletState || !safe.featureFlags) {
          throw new Error('Invalid diagnostics snapshot');
        }
        if (active) {
          setSnapshot(safe);
          setReport(JSON.stringify(safe, null, 2));
        }
      } catch {
        if (active) setLoadFailed(true); // Do not render raw exception messages.
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [loadGeneration]);

  const refreshDiagnostics = () => {
    if (isLoading || sharePending) return;
    // Keep the last safe snapshot available if a refresh cannot complete.
    // The existing effect cancels obsolete work when the generation changes.
    setLoadFailed(false);
    setShareFailed(false);
    setIsLoading(true);
    setLoadGeneration((generation) => generation + 1);
  };

  const shareDiagnostics = async () => {
    if (!report || isLoading || sharePending) return;
    setSharePending(true);
    setShareFailed(false);
    try {
      await Share.share({ title: 'PocketPay Diagnostics', message: report });
    } catch {
      setShareFailed(true); // Sharing errors can contain sensitive provider data.
    } finally {
      setSharePending(false);
    }
  };

  if (!__DEV__) return <Redirect href="/(tabs)" />;

  if (isLoading && !snapshot) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading diagnostics...</Text>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorValue}>Unable to load diagnostics.</Text>
        <TouchableOpacity
          onPress={refreshDiagnostics}
          accessibilityRole="button"
          accessibilityLabel="Retry diagnostics"
        >
          <Text style={styles.loadingText}>Retry diagnostics</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.loadingText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sections: DiagnosticSection[] = [
    {
      title: 'App Information',
      icon: <Smartphone color={colors.primary} size={20} />,
      items: [
        { label: 'Platform', value: snapshot.environment.platform + ' ' + String(snapshot.environment.osVersion) },
        { label: 'Version', value: snapshot.environment.appVersion },
        { label: 'Build Mode', value: snapshot.environment.isDevelopment ? 'Development' : 'Production' },
      ],
    },
    {
      title: 'Network Configuration',
      icon: <Globe color={colors.primary} size={20} />,
      items: [
        { label: 'Network', value: snapshot.network.label },
        { label: 'Network Tier', value: snapshot.network.tier },
      ],
    },
    {
      title: 'Service Endpoints',
      icon: <Server color={colors.primary} size={20} />,
      items: [
        { label: 'Horizon Host', value: snapshot.network.horizonHost },
        { label: 'Soroban RPC Host', value: snapshot.network.sorobanHost },
        { label: 'Vault Mode', value: snapshot.network.vaultMode },
        { label: 'Vault Contract', value: snapshot.network.vaultContractLabel },
      ],
    },
    {
      title: 'Wallet State',
      icon: <Wallet color={colors.primary} size={20} />,
      items: [
        { label: 'Wallet Configured', value: snapshot.walletState.hasPublicKey ? 'Yes' : 'No' },
        { label: 'Balance Loaded', value: snapshot.walletState.isBalanceLoaded ? 'Yes' : 'No' },
        { label: 'Balance State', value: snapshot.walletState.balanceState || 'Unknown' },
        { label: 'Funding Status', value: snapshot.walletState.fundingStatus || 'Unknown' },
      ],
    },
    {
      title: 'Security & Storage',
      icon: <ShieldCheck color={colors.primary} size={20} />,
      items: [
        { label: 'Secure Storage', value: snapshot.storage.secureStoreAvailable ? 'Available' : 'Unavailable' },
      ],
    },
    {
      title: 'Feature Flags',
      icon: <ShieldCheck color={colors.primary} size={20} />,
      items: Object.entries(snapshot.featureFlags)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, enabled]) => ({ label, value: enabled ? 'Enabled' : 'Disabled' })),
    },
    {
      title: 'Recent Errors',
      icon: <AlertCircle color={colors.error} size={20} />,
      items: [
        { label: 'Error Category', value: snapshot.networkHealth?.classifiedError || snapshot.lastReportedError?.name || 'None' },
        ...(snapshot.walletState.lastError
          ? [{ label: 'Wallet Error (redacted)', value: snapshot.walletState.lastError }]
          : []),
        ...(snapshot.lastReportedError
          ? [
              { label: 'Error Source', value: snapshot.lastReportedError.source },
              { label: 'Error Type', value: snapshot.lastReportedError.name },
              { label: 'Reported Error (redacted)', value: snapshot.lastReportedError.message },
            ]
          : []),
      ],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft color={colors.textPrimary} size={24} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Info color={colors.primary} size={24} />
          <Text style={styles.headerTitle}>Diagnostics</Text>
        </View>
      </View>

      <View style={styles.devBadge}>
        <Text style={styles.devBadgeText}>DEVELOPMENT BUILD</Text>
      </View>

      <Text style={styles.description}>
        Non-sensitive support diagnostics. Keys, balances, full RPC URLs and wallet secrets are excluded.
      </Text>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <View style={styles.sectionHeader}>
            {section.icon}
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
          <View style={styles.card}>
            {section.items.map((item, index) => (
              <View key={item.label} style={[styles.row, index < section.items.length - 1 && styles.rowBorder]}>
                <Text style={styles.label}>{item.label}</Text>
                <Text
                  style={[styles.value, item.isSensitive && styles.sensitiveValue, section.title === 'Recent Errors' && styles.errorValue]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {isLoading && (
        <View style={styles.refreshStatus}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Refreshing diagnostics...</Text>
        </View>
      )}
      {loadFailed && (
        <Text style={styles.errorValue}>
          Unable to refresh diagnostics. Showing the previous safe snapshot.
        </Text>
      )}
      <TouchableOpacity
        style={[styles.refreshButton, (isLoading || sharePending) && styles.disabledButton]}
        onPress={refreshDiagnostics}
        disabled={isLoading || sharePending}
        accessibilityRole="button"
        accessibilityLabel="Refresh Diagnostics"
        accessibilityState={{ disabled: isLoading || sharePending }}
      >
        <Text style={styles.refreshButtonText}>Refresh Diagnostics</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.exportButton, (isLoading || sharePending) && styles.disabledButton]}
        onPress={() => { void shareDiagnostics(); }}
        disabled={isLoading || sharePending}
        accessibilityRole="button"
        accessibilityLabel="Export Diagnostics Log"
        accessibilityState={{ disabled: isLoading || sharePending }}
      >
        <Text style={styles.exportButtonText}>
          {sharePending ? 'Sharing diagnostics...' : 'Export Diagnostics Log'}
        </Text>
      </TouchableOpacity>
      {shareFailed && <Text style={styles.errorValue}>Unable to share diagnostics. Please try again.</Text>}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          This screen is only available in development builds. Review the report before sharing.
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      padding: SIZES.lg,
      paddingBottom: SIZES.xxl * 2,
    },
    loadingText: {
      color: colors.textSecondary,
      marginTop: SIZES.md,
      fontSize: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SIZES.lg,
    },
    backButton: {
      width: 44,
      height: 44,
      paddingHorizontal: 0,
      marginRight: SIZES.md,
    },
    headerTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginLeft: SIZES.sm,
    },
    devBadge: {
      backgroundColor: colors.warning,
      paddingVertical: SIZES.xs,
      paddingHorizontal: SIZES.md,
      borderRadius: RADIUS.sm,
      alignSelf: 'flex-start',
      marginBottom: SIZES.md,
    },
    devBadgeText: {
      color: '#000',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    description: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: SIZES.xl,
    },
    section: {
      marginBottom: SIZES.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SIZES.sm,
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
      marginLeft: SIZES.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: SIZES.md,
      paddingHorizontal: SIZES.lg,
    },
    rowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 14,
      flex: 1,
    },
    value: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'right',
      flex: 1,
      marginLeft: SIZES.md,
    },
    sensitiveValue: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12,
    },
    errorValue: {
      color: colors.error,
      fontSize: 12,
    },
    refreshStatus: {
      alignItems: 'center',
      marginTop: SIZES.sm,
    },
    refreshButton: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      paddingVertical: SIZES.md,
      paddingHorizontal: SIZES.lg,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      marginTop: SIZES.sm,
    },
    refreshButtonText: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    disabledButton: {
      opacity: 0.5,
    },
    exportButton: {
      backgroundColor: colors.primary,
      paddingVertical: SIZES.md,
      paddingHorizontal: SIZES.lg,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      marginTop: SIZES.sm,
    },
    exportButtonText: {
      color: colors.background,
      fontSize: 15,
      fontWeight: '600',
    },
    footer: {
      alignItems: 'center',
      marginTop: SIZES.xl,
    },
    footerText: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
    },
  });
