/** Validation only: cold-start-safe launch into unchanged production Review. */
import React, { useEffect, useRef } from 'react';
import { useLocalSearchParams, useNavigationContainerRef, useRootNavigationState, useRouter } from 'expo-router';
import { useSignerStore } from '../src/store/signerStore';

declare global {
  var __pocket321NativeFixture: {
    outcome: string; sourcePublicKey: string; destinationPublicKey: string;
    submitCalls: number; readCalls: number; transactionHash: string | null; restore: () => void;
  } | undefined;
}

export default function NativeAttemptFixture() {
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();
  const rootNavigationState = useRootNavigationState();
  const navigated = useRef(false);
  const { outcome = 'unknown' } = useLocalSearchParams<{ outcome?: string }>();

  useEffect(() => {
    const begin = () => {
      // Expo Router's installed assertIsReady checks this same real ref.
      // A root state key can exist before the NavigationContainer is ready.
      if (!rootNavigationState?.key || !navigationRef.isReady() || navigated.current) return;
      const fixture = globalThis.__pocket321NativeFixture;
      if (!fixture) throw new Error('Native fixture bootstrap is required');
      navigated.current = true;
      fixture.outcome = outcome;
      fixture.submitCalls = 0;
      fixture.readCalls = 0;
      fixture.transactionHash = null;
      useSignerStore.setState({ activeSubmission: null, unknownSubmission: null });
      useSignerStore.getState().reset();
      router.replace({ pathname: '/review-transaction', params: {
        destination: fixture.destinationPublicKey, amount: '1.25', memo: 'Dummy native fixture',
      } });
    };
    // Observe real native navigation lifecycle, with no timer/router stub.
    const removeReady = navigationRef.addListener('ready', begin);
    const removeState = navigationRef.addListener('state', begin);
    begin();
    return () => { removeReady(); removeState(); };
  }, [navigationRef, outcome, rootNavigationState?.key, router]);
  return null;
}
