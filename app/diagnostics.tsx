import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share } from 'react-native';
import { Stack } from 'expo-router';
import { getDiagnostics } from '../src/utils/diagnostics';

/**
 * Dev-only child that throws on demand so release testers can exercise the
 * root ErrorBoundary → ErrorBoundaryFallback path (see release-testing-checklist §5.3).
 */
const SyntheticErrorTrigger: React.FC = () => {
  const [shouldCrash, setShouldCrash] = useState(false);

  if (shouldCrash) {
    throw new Error('Synthetic diagnostics error for ErrorBoundary testing');
  }

  return (
    <TouchableOpacity
      style={styles.dangerButton}
      onPress={() => setShouldCrash(true)}
      accessibilityRole="button"
      accessibilityLabel="Trigger a synthetic render error to test the error boundary"
    >
      <Text style={styles.dangerButtonText}>Trigger Test Error</Text>
    </TouchableOpacity>
  );
};

export default function DiagnosticsScreen() {
  const [diagnosticsJson, setDiagnosticsJson] = useState<string>('');
  const [parsedData, setParsedData] = useState<Record<string, any> | null>(null);

  const loadDiagnostics = async () => {
    const raw = await getDiagnostics();
    setDiagnosticsJson(raw);
    try {
      setParsedData(JSON.parse(raw));
    } catch {
      setParsedData(null);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const handleShare = async () => {
    if (!diagnosticsJson) return;
    try {
      await Share.share({
        message: diagnosticsJson,
        title: 'App Diagnostics Log',
      });
    } catch (error) {
      console.error('Error sharing diagnostics:', error);
    }
  };

  const lastReported = parsedData?.lastReportedError;
  const rawCategory = parsedData?.networkHealth?.hasError
    ? parsedData.networkHealth.classifiedError
    : parsedData?.walletState?.lastError
      ? 'wallet'
      : lastReported
        ? lastReported.name
        : null;
  const recentErrorCategory = rawCategory && rawCategory !== 'none'
    ? String(rawCategory)
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'None';

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Diagnostics' }} />

      <Text style={styles.title}>System Diagnostics</Text>
      <Text style={styles.description}>
        Safe, redacted app status for troubleshooting and support. On-screen failures are category-only; wallet secrets, addresses, balances, and raw error details are never displayed.
      </Text>

      {parsedData && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Environment</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Platform</Text>
            <Text style={styles.value}>{parsedData.environment.platform} ({parsedData.environment.osVersion})</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>App Version</Text>
            <Text style={styles.value}>{parsedData.environment.appVersion}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Mode</Text>
            <Text style={styles.value}>{parsedData.environment.isDevelopment ? 'Development' : 'Production'}</Text>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Network</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Network</Text>
            <Text style={styles.value}>{parsedData.network.label}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Horizon</Text>
            <Text style={styles.value}>{parsedData.network.horizonHost}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Soroban RPC</Text>
            <Text style={styles.value}>{parsedData.network.sorobanHost}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Vault</Text>
            <Text style={styles.value}>{parsedData.network.vaultMode === 'configured' ? parsedData.network.vaultContractLabel : 'Mock (no contract)'}</Text>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Feature Flags</Text>
          {Object.entries(parsedData.featureFlags ?? {}).map(([flag, enabled]) => (
            <View style={styles.row} key={flag}>
              <Text style={styles.label}>{flag}</Text>
              <Text style={styles.value}>{enabled ? 'On' : 'Off'}</Text>
            </View>
          ))}

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Storage</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Secure Storage</Text>
            <Text style={styles.value}>{parsedData.storage?.secureStoreAvailable ? 'Available' : 'Unavailable'}</Text>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Wallet Status</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Wallet Configured</Text>
            <Text style={styles.value}>{parsedData.walletState.hasPublicKey ? 'Yes' : 'No'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Balance Loaded</Text>
            <Text style={styles.value}>{parsedData.walletState.isBalanceLoaded ? 'Yes' : 'No'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Recent Error Category</Text>
            <Text style={styles.value}>{recentErrorCategory}</Text>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Last Reported Failure</Text>
          {lastReported ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Source</Text>
                <Text style={styles.value}>{lastReported.source}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Name</Text>
                <Text style={styles.value}>{lastReported.name}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Fatal</Text>
                <Text style={styles.value}>{lastReported.isFatal ? 'Yes' : 'No'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Time</Text>
                <Text style={styles.value}>{lastReported.timestamp}</Text>
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.value}>None recorded this session</Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={handleShare}
        accessibilityRole="button"
        accessibilityLabel="Export redacted diagnostics log"
      >
        <Text style={styles.buttonText}>Export Diagnostics Log</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={loadDiagnostics}
        accessibilityRole="button"
        accessibilityLabel="Refresh diagnostics data"
      >
        <Text style={styles.secondaryButtonText}>Refresh</Text>
      </TouchableOpacity>

      {__DEV__ && (
        <View style={styles.devCard}>
          <Text style={styles.sectionTitle}>Developer Tools</Text>
          <Text style={styles.devHint}>
            Throws a render-time error so you can verify the global ErrorBoundary fallback and recovery actions.
          </Text>
          <SyntheticErrorTrigger />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8f9fa' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 6 },
  description: { fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e9ecef' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#212529', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', gap: 12 },
  label: { fontSize: 14, color: '#495057', flexShrink: 0 },
  value: { fontSize: 14, fontWeight: '500', color: '#212529', flexShrink: 1, textAlign: 'right' },
  valueWrap: { flex: 1 },
  button: { backgroundColor: '#0066cc', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 16 },
  secondaryButton: { backgroundColor: '#e9ecef', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 24 },
  secondaryButtonText: { color: '#212529', fontWeight: '600', fontSize: 16 },
  devCard: { backgroundColor: '#fff8e6', borderRadius: 10, padding: 16, marginBottom: 32, borderWidth: 1, borderColor: '#ffe8a3' },
  devHint: { fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 18 },
  dangerButton: { backgroundColor: '#d6320f', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  dangerButtonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
});
