/**
 * VALIDATION ONLY. Install at the checkout root as native-baseline-cases.tsx.
 * The rendered production components and their hooks are unchanged.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useNavigationContainerRef } from 'expo-router';
import CreateWalletScreen from './app/(auth)/create';
import ImportWalletScreen from './app/(auth)/import';
import SignConfirmationScreen from './app/sign-confirmation';
import { ContactPicker } from './src/components/ContactPicker';
import type { Contact } from './src/features/contacts/contactStore';

export type BaselineNativeFixtureApi = {
  counters: Record<string, number>;
  publicKey: string;
  destinationPublicKey: string;
  log: (event: string, details?: Record<string, unknown>) => void;
  navigationObserver?: {
    ref: unknown;
    unsubscribe: () => void;
    observedReviewKeys: Set<string>;
  };
};

function getFixture(): BaselineNativeFixtureApi {
  const fixture = (globalThis as typeof globalThis & {
    __pocketBaselineNativeFixture?: BaselineNativeFixtureApi;
  }).__pocketBaselineNativeFixture;
  if (!fixture) throw new Error('Start the baseline native fixture entry before opening a case.');
  return fixture;
}

function record(event: string, details?: Record<string, unknown>) {
  const fixture = getFixture();
  fixture.counters[event] = (fixture.counters[event] || 0) + 1;
  fixture.log(event, details);
}

export function CreateCase() {
  useEffect(() => {
    getFixture().log('create-case-mounted', { secretDisplay: 'production default mask' });
  }, []);
  return <CreateWalletScreen />;
}

export function ImportCase() {
  useEffect(() => {
    getFixture().log('import-case-mounted', { scope: 'empty and invalid input only' });
  }, []);
  return <ImportWalletScreen />;
}

type FocusedRoute = {
  key?: string;
  name: string;
  params?: Record<string, unknown>;
};

function getFocusedRoute(state: unknown): FocusedRoute | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = state as { index?: number; routes?: unknown[] };
  if (!Array.isArray(candidate.routes) || candidate.routes.length === 0) return null;
  const route = candidate.routes[candidate.index ?? candidate.routes.length - 1];
  if (!route || typeof route !== 'object') return null;
  const item = route as FocusedRoute & { state?: unknown };
  if (typeof item.name !== 'string') return null;
  return getFocusedRoute(item.state) || item;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function SignConfirmationCase() {
  // These are the real route query parameters; no router hook is replaced.
  const params = useLocalSearchParams<{
    source?: string; destination?: string; amount?: string; assetCode?: string;
    memo?: string; fee?: string; network?: string;
  }>();
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    getFixture().log('sign-case-query', {
      source: stringParam(params.source),
      destination: stringParam(params.destination),
      amount: stringParam(params.amount),
      assetCode: stringParam(params.assetCode),
      memo: stringParam(params.memo),
      fee: stringParam(params.fee),
      network: stringParam(params.network),
    });
  }, [params.source, params.destination, params.amount, params.assetCode,
    params.memo, params.fee, params.network]);

  useEffect(() => {
    const fixture = getFixture();
    if (fixture.navigationObserver?.ref === navigationRef) return;
    const observedReviewKeys = fixture.navigationObserver?.observedReviewKeys || new Set<string>();
    fixture.navigationObserver?.unsubscribe();
    const observe = (state: unknown) => {
      const route = getFocusedRoute(state);
      if (route?.name !== 'review-transaction' || !route.key ||
          observedReviewKeys.has(route.key)) return;
      observedReviewKeys.add(route.key);
      // Count a distinct native route entry, not a synthetic router invocation.
      record('signReviewRouteEntries', {
        routeName: route.name,
        routeKey: route.key,
        destination: stringParam(route.params?.destination),
        amount: stringParam(route.params?.amount),
        memo: stringParam(route.params?.memo),
      });
    };
    const unsubscribe = navigationRef.addListener('state', event => {
      observe(navigationRef.isReady() ? navigationRef.getRootState() : event.data.state);
    });
    fixture.navigationObserver = { ref: navigationRef, unsubscribe, observedReviewKeys };
    if (navigationRef.isReady()) observe(navigationRef.getRootState());
    // Validation observer lifetime is the process, not this host. Production
    // RootLayout's Slot unmounts this host when Review becomes the active route.
    // Returning a cleanup here could lose the real navigation state event.
    fixture.log('real-navigation-observer-installed');
  }, [navigationRef]);

  return <SignConfirmationScreen />;
}

export function ContactPickerCase() {
  const [visible, setVisible] = useState(true);
  const [withEdit, setWithEdit] = useState(true);
  const [lastCallback, setLastCallback] = useState('No picker callback yet.');

  useEffect(() => { getFixture().log('picker-case-mounted'); }, []);

  const onSelect = (address: string) => {
    record('pickerSelect', { address });
    setLastCallback(`Select callback: ${address}`);
    setVisible(false);
  };
  const onCancel = () => {
    record('pickerCancel');
    setLastCallback('Cancel callback.');
    setVisible(false);
  };
  const onAddNew = () => {
    record('pickerAddNew');
    setLastCallback('Add callback. No contact form or persistent write was opened.');
    setVisible(false);
  };
  const onEdit = (contact: Contact) => {
    record('pickerEdit', { id: contact.id, name: contact.name, address: contact.address });
    setLastCallback(`Edit callback: ${contact.name}`);
    setVisible(false);
  };
  const open = (editable: boolean) => {
    setWithEdit(editable);
    setVisible(true);
  };

  return (
    <View style={styles.pickerPage}>
      <Text style={styles.note}>
        Fixture controls below reopen the unchanged production ContactPicker.
        Select, add and edit report callbacks. Delete affects dummy memory contacts only.
      </Text>
      <Text style={styles.result} testID="native-picker-last-callback">{lastCallback}</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.button}
        onPress={() => open(true)}>
        <Text style={styles.buttonText}>Open picker with edit callback</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.button}
        onPress={() => open(false)}>
        <Text style={styles.buttonText}>Open picker without edit callback</Text>
      </TouchableOpacity>
      <ContactPicker visible={visible} onSelect={onSelect} onCancel={onCancel}
        onAddNew={onAddNew} onEdit={withEdit ? onEdit : undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  pickerPage: { flex: 1, padding: 18, backgroundColor: '#07111f' },
  note: { color: '#c9eaff', fontSize: 14, lineHeight: 21, marginBottom: 18 },
  result: { color: '#fff', fontSize: 14, lineHeight: 21, marginBottom: 18 },
  button: { padding: 14, borderRadius: 8, backgroundColor: '#15344d', marginBottom: 12 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
