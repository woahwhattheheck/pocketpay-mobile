import { useCallback, useEffect, useState } from 'react';
import { server } from '../../services/stellar';
import { FeeEstimate, readFeeEstimate } from './feeEstimate';

const LOADING: FeeEstimate = { status: 'loading' };
const UNAVAILABLE: FeeEstimate = { status: 'unavailable' };

export function usePaymentFeeEstimate(requestKey: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string | null;
    attempt: number;
    estimate: FeeEstimate;
  }>({ key: requestKey, attempt: 0, estimate: LOADING });

  useEffect(() => {
    if (requestKey === null) return;
    let current = true;
    setResult({ key: requestKey, attempt, estimate: LOADING });
    void readFeeEstimate(() => server.fetchBaseFee()).then((estimate) => {
      if (current) setResult({ key: requestKey, attempt, estimate });
    });
    return () => { current = false; };
  }, [requestKey, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  // Mask the previous quote synchronously, before the next effect runs.
  const estimate = requestKey === null ? UNAVAILABLE
    : result.key === requestKey && result.attempt === attempt ? result.estimate : LOADING;
  return { estimate, retry };
}
