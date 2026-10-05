/** Dedicated validation controller only; production components/hooks unchanged. */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import HistoryScreen from './app/(tabs)/history';
import DiagnosticsScreen from './app/diagnostics';
import { ErrorBoundaryFallback } from './src/components/ErrorBoundaryFallback';

const getFixture = () => (globalThis as typeof globalThis & {
  __pocketBaselineNativeFixture: {
    counters: Record<string, number>;
    log: (event: string, details?: Record<string, unknown>) => void;
    setHistoryWallet: (present: boolean) => void;
  };
}).__pocketBaselineNativeFixture;

export function HistoryCase() {
  const fixture = getFixture();
  useEffect(() => {
    fixture.counters.historyMounts++;
    fixture.setHistoryWallet(false);
    fixture.log('history-instance-mounted');
    return () => {
      fixture.counters.historyUnmounts++;
      fixture.log('history-instance-unmounted');
    };
  }, [fixture]);
  return <View style={styles.page}>
    <View style={styles.controls}>
      <TouchableOpacity style={styles.button} onPress={() => fixture.setHistoryWallet(true)}>
        <Text style={styles.buttonText}>Hydrate DUMMY wallet</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => fixture.setHistoryWallet(false)}>
        <Text style={styles.buttonText}>Remove DUMMY wallet</Text>
      </TouchableOpacity>
    </View>
    {/* Stable element position/type/key across each memory wallet transition. */}
    <HistoryScreen />
  </View>;
}

export function DiagnosticsCase() {
  const fixture = getFixture();
  useEffect(() => {
    fixture.counters.diagnosticMounts++;
    fixture.log('diagnostics-mounted');
  }, [fixture]);
  // Actual production readiness probe writes and deletes only its nonsecret
  // __diagnostics_test__ sentinel through the real native SecureStore API.
  return <DiagnosticsScreen />;
}

const harmlessError = new Error('DUMMY_NATIVE_DIAGNOSTICS_FIXTURE');
export function DiagnosticShareCase() {
  const fixture = getFixture();
  useEffect(() => {
    fixture.counters.fallbackMounts++;
    fixture.log('real-error-fallback-mounted');
  }, [fixture]);
  return <ErrorBoundaryFallback error={harmlessError} onReset={() => fixture.log('fallback-reset')} />;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, controls: { flexDirection: 'row', padding: 6, gap: 6 },
  button: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#244d6b' },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
