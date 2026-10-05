/**
 * UNTRACKED NATIVE EVIDENCE FIXTURE — never ship this route in the feature PR.
 * Copy to app/(auth)/__payment-retry-native-fixture.tsx in a validation checkout.
 * The auth group permits the dummy recovery screen without a stored wallet.
 * Production PaymentRetryScreen, components and status service are unchanged.
 * All signer metadata and Horizon read responses below are controlled dummy data.
 * Query: ?outcome=unknown|error|confirmed|failed|nohash|empty|mismatch
 */
import React, { useEffect } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import PaymentRetryScreen from '../payment-retry';
import { server } from '../../src/services/stellar';
import { useSignerStore } from '../../src/store/signerStore';
import type { TransactionReview } from '../../src/types/signer';

type ReadServer = {
  transactions: () => { transaction: (hash: string) => { call: () => Promise<unknown> } };
};

export default function PaymentRetryNativeFixture() {
  const { outcome = 'unknown' } = useLocalSearchParams<{ outcome?: string }>();
  useEffect(() => {
    const reads = server as unknown as ReadServer;
    const originalTransactions = reads.transactions;
    const originalSubmit = server.submitTransaction;
    const hash = 'a'.repeat(64);
    const review: TransactionReview = {
      requestId: `native-dummy-${outcome}`,
      sourcePublicKey: 'DUMMY_SOURCE_TESTNET',
      destinationPublicKey: 'DUMMY_RECIPIENT_TESTNET',
      amount: '1.25', assetCode: 'XLM', network: 'Testnet',
      createdAt: '2026-10-05T00:00:00Z', timeoutSeconds: 30,
    };
    reads.transactions = () => ({ transaction: (requestedHash) => ({ call: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
      if (requestedHash !== hash) throw new Error('Unexpected dummy fixture hash');
      if (outcome === 'error') throw new Error('DUMMY_PRIVATE_PROVIDER_PAYLOAD');
      if (outcome === 'unknown') throw { response: { status: 404 } };
      return { hash: outcome === 'mismatch' ? 'b'.repeat(64) : hash, successful: outcome === 'confirmed' };
    } }) });
    // Guard the native evidence session: the fixture never signs or broadcasts.
    server.submitTransaction = async () => { throw new Error('Broadcast disabled in dummy native fixture'); };
    useSignerStore.setState({ activeSubmission: null, unknownSubmission: null });
    useSignerStore.getState().reset();
    if (outcome !== 'empty') {
      useSignerStore.getState().recordUnknownSubmission(outcome === 'nohash' ? undefined : hash, review);
    }
    return () => {
      reads.transactions = originalTransactions;
      server.submitTransaction = originalSubmit;
    };
  }, [outcome]);
  return <><Stack.Screen options={{ headerShown: false }} /><PaymentRetryScreen /></>;
}
