export type FeeEstimate =
  | { status: 'loading' }
  | { status: 'available'; feeStroops: number }
  | { status: 'unavailable' }
  | { status: 'error' };

type CompletedEstimate = Exclude<FeeEstimate, { status: 'loading' }>;

/** Horizon base fees are positive integer stroops per operation, not XLM. */
export function isValidFeeStroops(fee: unknown): fee is number {
  return typeof fee === 'number' && Number.isSafeInteger(fee) && fee > 0 && fee <= 0xffffffff;
}

export function feeEstimateValue(estimate: FeeEstimate): string {
  if (estimate.status === 'loading') return 'Loading estimate…';
  if (estimate.status !== 'available') return 'Unavailable';
  const digits = String(estimate.feeStroops).padStart(8, '0');
  return `~${digits.slice(0, -7)}.${digits.slice(-7)} XLM`;
}

export function feeEstimateMessage(estimate: FeeEstimate): string {
  switch (estimate.status) {
    case 'loading': return 'Loading the network fee. You can still review or edit your payment.';
    case 'available': return 'Estimate for one XLM payment. The network fee may change before submission.';
    case 'unavailable': return 'Fee estimate unavailable. Retry before signing; no payment has been sent.';
    case 'error': return 'Could not load the network fee. Check your connection and retry before signing.';
  }
}

/** A slow, invalid or failed estimate must never become a zero-fee quote. */
export function readFeeEstimate(
  fetchFee: () => Promise<unknown>,
  timeoutMs = 10_000,
): Promise<CompletedEstimate> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (estimate: CompletedEstimate) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(estimate);
    };
    const timer = setTimeout(() => finish({ status: 'unavailable' }), timeoutMs);
    Promise.resolve().then(fetchFee).then(
      (fee) => finish(isValidFeeStroops(fee)
        ? { status: 'available', feeStroops: fee }
        : { status: 'unavailable' }),
      () => finish({ status: 'error' }),
    );
  });
}
