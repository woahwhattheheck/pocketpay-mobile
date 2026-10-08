import React, { useEffect, useMemo, useState } from 'react';
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
import { redactSensitiveString, redactSensitiveValue } from '../src/utils/redactSensitive';
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

/** Only render fields from the redacted diagnostics builder, never raw store state. */
interface DiagnosticsSnapshot {
  environment: {
    platform: string;
    osVersion: string | number;
    appVersion: string;
    isDevelopment: boolean;
  };
  network: {
    tier: string;
    label: string;
    horizonHost: string;
    sorobanHost: string;
    vaultMode: string;
    vaultContractLabel: string;
  };
  storage: {
    secureStoreAvailable: boolean;
    secureStoreStatus?: string;
    secureStoreOperational?: boolean;
  };
  featureFlags: Record<string, boolean>;
  appState?: {
    isInitialized: boolean;
    themeMode: string;
    contactsCount: number;
  };
  walletState: {
    hasPublicKey: boolean;
    isBalanceLoaded: boolean;
    balanceState?: string;
    fundingStatus?: string;
    lastError: string | null;
  };
  networkHealth?: {
    classifiedError: string | null;
    hasError: boolean;
  };
  lastReportedError: {
    source: string;
    name: string;
    message: string;
    isFatal: boolean;
  } | null;
}

const display = (value: unknown, fallback = 'Unknown'): string => {
  if (typeof value === 'string') {
    return value ? redactSensitiveString(value) : fallback;
  }
  return typeof value === 'number' ? String(value) : fallback;
};

const yesNo = (value: boolean | undefined): string =>
  value === true ? 'Yes' : value === false ? 'No' : 'Unknown';

export default function DiagnosticsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [reportText, setReportText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);

  useEffect(() => {
    if (!__DEV__) return;
    let mounted = true;
    getDiagnostics()
      .then((raw) => {
        // Redact again at the presentation/share boundary. Never surface the
        // thrown error or original wallet/vault error strings to the screen.
        const safeReport = JSON.stringify(redactSensitiveValue(JSON.parse(raw)), null, 2);
        const parsed = JSON.parse(safeReport) as DiagnosticsSnapshot;
        if (!parsed?.environment || !parsed.network || !parsed.walletState ||
            !parsed.storage || !parsed.featureFlags) {
          throw new Error('Missing diagnostics fields');
        }
        if (mounted) {
          setSnapshot(parsed);
          setReportText(safeReport);
        }
      })
      .catch(() => {
        if (mounted) setLoadFailed(true);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const shareReport = async () => {
    if (!reportText) return;
    try {
      setShareFailed(false);
      await Share.share({ message: reportText, title: 'PocketPay Diagnostics' });
    } catch {
      // A support report is voluntary; never upload it automatically.
      setShareFailed(true);
    }
  };

  // The screen and share action must never be accessible in production.
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading diagnostics...</Text>
      </View>
    );
  }

  if (loadFailed || !snapshot) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Diagnostics unavailable. Please try again later.</Text>
      </View>
    );
  }

  const sections: DiagnosticSection[] = [
    {
      title: 'App Information',
      icon: <Smartphone color={colors.primary} size={20} />,
      items: [
        { label: 'Platform', value: display(snapshot.environment.platform) },
        { label: 'OS Version', value: display(snapshot.environment.osVersion) },
        { label: 'Version', value: display(snapshot.environment.appVersion) },
        { label: 'Build Mode', value: snapshot.environment.isDevelopment ? 'Development' : 'Production' },
      ],
    },
    {
      title: 'Network Configuration',
      icon: <Globe color={colors.primary} size={20} />,
      items: [
        { label: 'Network', value: display(snapshot.network.label) },
        { label: 'Network Tier', value: display(snapshot.network.tier) },
        { label: 'Vault Mode', value: display(snapshot.network.vaultMode) },
      ],
    },
    {
      title: 'Service Endpoints',
      icon: <Server color={colors.primary} size={20} />,
      items: [
        { label: 'Horizon Host', value: display(snapshot.network.horizonHost) },
        { label: 'Soroban RPC Host', value: display(snapshot.network.sorobanHost) },
        { label: 'Vault Contract', value: display(snapshot.network.vaultContractLabel), isSensitive: true },
      ],
    },
    {
      title: 'Wallet State',
      icon: <Wallet color={colors.primary} size={20} />,
      items: [
        { label: 'Wallet Configured', value: yesNo(snapshot.walletState.hasPublicKey) },
        { label: 'Balance Loaded', value: yesNo(snapshot.walletState.isBalanceLoaded) },
        { label: 'Balance State', value: display(snapshot.walletState.balanceState) },
        { label: 'Funding Status', value: display(snapshot.walletState.fundingStatus) },
      ],
    },
    {
      title: 'Security & Storage',
      icon: <ShieldCheck color={colors.primary} size={20} />,
      items: [
        {
          label: 'Secure Storage',
          value: snapshot.storage.secureStoreAvailable ? 'Available' : 'Unavailable',
        },
        ...(snapshot.storage.secureStoreStatus ? [{
          label: 'Storage Status',
          value: display(snapshot.storage.secureStoreStatus),
        }] : []),
      ],
    },
    {
      title: 'Feature Flags',
      icon: <Info color={colors.primary} size={20} />,
      items: Object.entries(snapshot.featureFlags)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, enabled]) => ({
          label: display(key),
          value: enabled ? 'Enabled' : 'Disabled',
        })),
    },
  ];

  if (snapshot.appState) {
    sections.push({
      title: 'App State',
      icon: <Info color={colors.primary} size={20} />,
      items: [
        { label: 'Initialized', value: yesNo(snapshot.appState.isInitialized) },
        { label: 'Theme', value: display(snapshot.appState.themeMode) },
        { label: 'Saved Contacts', value: display(snapshot.appState.contactsCount) },
      ],
    });
  }

  if (snapshot.networkHealth) {
    sections.push({
      title: 'Network Health',
      icon: <Globe color={colors.primary} size={20} />,
      items: [
        { label: 'Network Error', value: yesNo(snapshot.networkHealth.hasError) },
        { label: 'Error Category', value: display(snapshot.networkHealth.classifiedError, 'None') },
      ],
    });
  }

  const recentErrors: DiagnosticItem[] = [];
  if (snapshot.walletState.lastError) {
    recentErrors.push({
      label: 'Wallet Error',
      value: redactSensitiveString(snapshot.walletState.lastError),
    });
  }
  if (snapshot.lastReportedError) {
    recentErrors.push(
      { label: 'Last Error Source', value: display(snapshot.lastReportedError.source) },
      { label: 'Last Error Type', value: display(snapshot.lastReportedError.name) },
      { label: 'Reported Message', value: display(snapshot.lastReportedError.message) },
    );
  }
  if (recentErrors.length) {
    sections.push({
      title: 'Recent Errors',
      icon: <AlertCircle color={colors.error} size={20} />,
      items: recentErrors,
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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
        This screen shows a redacted support snapshot. Wallet secrets, public
        keys, balances and full service URLs are never displayed.
      </Text>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <View style={styles.sectionHeader}>
            {section.icon}
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
          <View style={styles.card}>
            {section.items.map((item, index) => (
              <View
                key={item.label}
                style={[styles.row, index < section.items.length - 1 && styles.rowBorder]}
              >
                <Text style={styles.label}>{item.label}</Text>
                <Text
                  style={[
                    styles.value,
                    item.isSensitive && styles.sensitiveValue,
                    section.title === 'Recent Errors' && styles.errorValue,
                  ]}
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

      <TouchableOpacity
        style={styles.exportButton}
        onPress={() => { void shareReport(); }}
        accessibilityRole="button"
        accessibilityLabel="Export Diagnostics Log"
      >
        <Text style={styles.exportButtonText}>Export Diagnostics Log</Text>
      </TouchableOpacity>
      {shareFailed && (
        <Text style={styles.errorText}>Unable to open the share sheet.</Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Only available in development builds. Sharing requires your action.
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
    exportButton: {
      backgroundColor: colors.primary,
      borderRadius: RADIUS.md,
      padding: SIZES.md,
      alignItems: 'center',
      marginTop: SIZES.sm,
    },
    exportButtonText: {
      color: colors.background,
      fontSize: 14,
      fontWeight: '700',
    },
    errorText: {
      color: colors.error,
      padding: SIZES.lg,
      textAlign: 'center',
      fontSize: 14,
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
