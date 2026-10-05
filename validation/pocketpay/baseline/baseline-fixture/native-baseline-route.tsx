/** Install at app/send/__baseline-native-fixture.tsx in validation checkout only. */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CreateCase, ImportCase, SignConfirmationCase, ContactPickerCase } from '../../native-baseline-cases';
import { HistoryCase, DiagnosticsCase, DiagnosticShareCase } from '../../native-baseline-observation-cases';

type Snapshot = {
  label: string; ready: boolean; counters: Record<string, number>; walletPresent: boolean;
  transport: { secretAccess: number; broadcastAttempts: number; deposit: number; withdraw: number };
};
const getFixture = () => (globalThis as typeof globalThis & {
  __pocketBaselineNativeFixture: {
    snapshot: () => Snapshot;
    subscribe: (listener: (state: Snapshot) => void) => () => void;
  };
}).__pocketBaselineNativeFixture;

export default function BaselineNativeFixture() {
  const { case: selected = 'history' } = useLocalSearchParams<{ case?: string }>();
  const fixture = getFixture();
  if (!fixture) throw new Error('The dedicated native baseline entry is required.');
  const [state, setState] = useState(() => fixture.snapshot());
  useEffect(() => fixture.subscribe(setState), [fixture]);
  const counts = state.counters;
  const Case = selected === 'create' ? CreateCase : selected === 'import' ? ImportCase :
    selected === 'sign' ? SignConfirmationCase : selected === 'picker' ? ContactPickerCase :
    selected === 'diagnostics' ? DiagnosticsCase : selected === 'share' ? DiagnosticShareCase : HistoryCase;
  return <View style={styles.page}>
    <View style={styles.banner}>
      <Text style={styles.label}>{state.label}</Text>
      <Text style={styles.text}>
        case={selected} ready={String(state.ready)} wallet={String(state.walletPresent)}{'\n'}
        historyMounts={counts.historyMounts} unmounts={counts.historyUnmounts} refreshes={counts.historyRefreshes}{'\n'}
        generates={counts.generateKeypair} saveAttempts={counts.walletSaveAttempts} reviewEntries={counts.signReviewRouteEntries}{'\n'}
        share={counts.shareCalls}/{counts.shareStringPayload}/{counts.shareRedactedPayload} clipboard={counts.clipboardAttempts}{'\n'}
        secret={state.transport.secretAccess} broadcast={state.transport.broadcastAttempts}
      </Text>
    </View>
    {state.ready ? <Case /> : <Text style={styles.text}>Preparing DUMMY memory fixture...</Text>}
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 28, backgroundColor: '#07111f' },
  banner: { padding: 8, backgroundColor: '#15344d', borderBottomWidth: 1, borderColor: '#46d5ff' },
  label: { color: '#fff', fontWeight: '700', fontSize: 10 },
  text: { color: '#bceaff', fontSize: 10, marginTop: 4 },
});
