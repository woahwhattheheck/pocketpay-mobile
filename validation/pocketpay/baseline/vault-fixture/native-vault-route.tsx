/** VALIDATION ONLY: install as app/__vault-native-fixture.tsx; never ship. */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import VaultScreen from './(tabs)/vault';

type Snapshot = {
  label: string; addLock: number; deposit: number; withdraw: number;
  secretAccess: number; broadcastAttempts: number; blockedFetch: number; blockedXHR: number;
  persistedLocks: number; lastLock: { amount: string; unlockDate: string; receivedAt: string } | null;
};
declare global {
  var __pocketVaultNativeFixture: {
    snapshot: () => Snapshot;
    subscribe: (listener: (state: Snapshot) => void) => () => void;
    restore: () => void;
  } | undefined;
}
export default function VaultNativeFixture() {
  const fixture = globalThis.__pocketVaultNativeFixture;
  if (!fixture) throw new Error('Start the validation entry before opening the vault fixture.');
  const [state, setState] = useState(() => fixture.snapshot());
  useEffect(() => fixture.subscribe(setState), [fixture]);
  return (
    <View style={styles.page}>
      <View style={styles.banner}>
        <Text style={styles.label}>{state.label}</Text>
        <Text style={styles.counters} testID="native-vault-counters">
          addLock={state.addLock} deposit={state.deposit} withdraw={state.withdraw}{'\n'}
          secretAccess={state.secretAccess} broadcastAttempts={state.broadcastAttempts}{'\n'}
          memoryLocks={state.persistedLocks} blockedFetch={state.blockedFetch} blockedXHR={state.blockedXHR}
        </Text>
      </View>
      <VaultScreen />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 28, backgroundColor: '#07111f' },
  banner: { padding: 10, backgroundColor: '#15344d', borderBottomWidth: 1, borderColor: '#46d5ff' },
  label: { color: '#fff', fontWeight: '700', fontSize: 11 },
  counters: { color: '#bceaff', fontSize: 12, marginTop: 5 },
});
