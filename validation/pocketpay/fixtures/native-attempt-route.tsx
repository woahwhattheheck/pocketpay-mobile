/** Validation-only top-level route: app/__payment-retry-attempt-native-fixture.tsx. */
import React, { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSignerStore } from '../src/store/signerStore';

declare global {
  var __pocket321NativeFixture: {
    outcome: string; sourcePublicKey: string; destinationPublicKey: string;
    submitCalls: number; readCalls: number; transactionHash: string | null; restore: () => void;
  } | undefined;
}

export default function NativeAttemptFixture() {
  const router = useRouter();
  const { outcome = 'unknown' } = useLocalSearchParams<{ outcome?: string }>();
  useEffect(() => {
    const fixture = globalThis.__pocket321NativeFixture;
    if (!fixture) throw new Error('Native fixture bootstrap is required');
    fixture.outcome = outcome;
    fixture.submitCalls = 0;
    fixture.readCalls = 0;
    fixture.transactionHash = null;
    useSignerStore.setState({ activeSubmission: null, unknownSubmission: null });
    useSignerStore.getState().reset();
    router.replace({ pathname: '/review-transaction', params: {
      destination: fixture.destinationPublicKey, amount: '1.25', memo: 'Dummy native fixture',
    } });
  }, [outcome, router]);
  return null;
}
