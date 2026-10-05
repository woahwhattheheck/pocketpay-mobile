/** Validation-only observer launch route; replaces itself with the exact original fixture. */
import React, { useEffect, useRef } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useNavigationContainerRef, useRootNavigationState, useRouter } from 'expo-router';

export default function RetryGapObserverLaunch() {
  const { outcome = 'nohash' } = useLocalSearchParams<{ outcome?: string }>();
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();
  const rootNavigationState = useRootNavigationState();
  const navigated = useRef(false);
  useEffect(() => {
    const begin = () => {
      if (!rootNavigationState?.key || !navigationRef.isReady() || navigated.current) return;
      const { installRetryGapObserver } = require('../retry-gap-observer');
      installRetryGapObserver(outcome);
      navigated.current = true;
      router.replace({
        pathname: '/send/__retry-gap-native-fixture',
        params: { outcome },
      });
    };
    const removeReady = navigationRef.addListener('ready', begin);
    const removeState = navigationRef.addListener('state', begin);
    begin();
    return () => { removeReady(); removeState(); };
  }, [navigationRef, outcome, router, rootNavigationState?.key]);
  return <Text>DUMMY TESTNET validation observer initialization. No signing or broadcast.</Text>;
}
