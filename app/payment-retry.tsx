import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { ReviewConfirm, type ReviewItem } from '../src/components/ReviewConfirm';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { SIZES } from '../src/constants/theme';
import { isTransactionHash, type PaymentSubmissionStatus } from '../src/features/payments/submissionOutcome';
import { useTheme } from '../src/hooks/useTheme';
import { fetchPaymentSubmissionStatus } from '../src/services/stellar';
import { useSignerStore } from '../src/store/signerStore';

/** This recovery route checks the existing payment; it never signs or sends one. */
export default function PaymentRetryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const submission = useSignerStore((state) => state.unknownSubmission);
  const [status, setStatus] = useState<PaymentSubmissionStatus>('unknown');
  const [checking, setChecking] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    setStatus('unknown');
    setLookupFailed(false);
    setShowDetails(false);
  }, [submission]);
  const hash = submission?.transactionHash;
  const canCheck = Boolean(hash && isTransactionHash(hash));
  const items = useMemo<ReviewItem[]>(() => submission ? [
    { label: 'Amount', value: `${submission.review.amount} ${submission.review.assetCode}` },
    { label: 'To', value: submission.review.destinationPublicKey, truncate: true },
    { label: 'Network', value: submission.review.network },
    ...(hash ? [{ label: 'Transaction Hash', value: hash, truncate: true }] : []),
  ] : [], [submission, hash]);

  const checkStatus = async () => {
    if (busy.current || !hash || !canCheck || status !== 'unknown') return;
    busy.current = true;
    setChecking(true);
    setLookupFailed(false);
    try {
      const result = await fetchPaymentSubmissionStatus(hash);
      if (mounted.current && useSignerStore.getState().unknownSubmission === submission) {
        setStatus(result);
      }
    } catch {
      if (mounted.current && useSignerStore.getState().unknownSubmission === submission) setLookupFailed(true);
    } finally {
      busy.current = false;
      if (mounted.current) setChecking(false);
    }
  };

  const finish = () => {
    // Only a definitive lookup result allows this screen to clear the uncertainty.
    if (status !== 'unknown' && submission) useSignerStore.getState().clearResolvedSubmission(submission);
    router.replace('/(tabs)/history');
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <ScreenHeader title="Payment Status" subtitle="Check the result before sending again" />
      {!submission ? (
        <>
          <Text style={[styles.copy, { color: colors.textPrimary }]}>No uncertain payment is available in this session. Check Activity before making another payment.</Text>
          <Button title="View Activity" onPress={() => router.replace('/(tabs)/history')} />
        </>
      ) : (
        <>
          <View accessibilityLiveRegion="polite" style={styles.section}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {status === 'confirmed' ? 'Payment Confirmed' : status === 'failed' ? 'Payment Not Completed' : 'Payment Status Unknown'}
            </Text>
            <Text style={[styles.copy, { color: colors.textSecondary }]}>
              {status === 'confirmed'
                ? 'The network confirms this payment completed. Do not send it again.'
                : status === 'failed'
                  ? 'The network confirms this transaction failed. Review Activity and your payment details before starting a new payment.'
                  : 'Your payment may already have completed. Do not send it again until its result is confirmed.'}
            </Text>
            {lookupFailed && <Text accessibilityRole="alert" style={[styles.copy, { color: colors.warning }]}>Could not check the payment status. Check your connection, then try checking again. This does not mean the payment failed.</Text>}
            {status === 'unknown' && !canCheck && <Text style={[styles.copy, { color: colors.textMuted }]}>No transaction hash is available. Check Activity and contact support or the recipient to confirm the result.</Text>}
          </View>
          {status === 'unknown' && canCheck && <Button
            title="Check Status"
            onPress={checkStatus}
            isLoading={checking}
            loadingText="Checking Status…"
            disabled={checking}
            accessibilityRole="button"
            accessibilityState={{ busy: checking, disabled: checking }}
          />}
          <Button title={showDetails ? 'Hide Payment Details' : 'View Payment Details'} variant="secondary" onPress={() => setShowDetails(!showDetails)} />
          {showDetails && <ReviewConfirm items={items} />}
          <Button title="Get Help" variant="outline" onPress={() => Alert.alert(
            'Payment status help',
            'Check Activity and ask the recipient whether the payment arrived. Share only the transaction hash and network with support. Never share your secret key or recovery phrase.',
          )} />
          <Button title={status === 'unknown' ? 'View Activity' : 'Done — View Activity'} variant="secondary" onPress={finish} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SIZES.xl, gap: SIZES.md, paddingBottom: SIZES.xxl },
  section: { gap: SIZES.md },
  title: { fontSize: 22, fontWeight: 'bold' },
  copy: { fontSize: 16, lineHeight: 24 },
});
