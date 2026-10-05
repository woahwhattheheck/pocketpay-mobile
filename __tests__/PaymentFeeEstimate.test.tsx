import { act, renderHook, waitFor } from '@testing-library/react-native';
import { server } from '../src/services/stellar';
import { feeEstimateValue, isValidFeeStroops, readFeeEstimate } from '../src/features/payments/feeEstimate';
import { usePaymentFeeEstimate } from '../src/features/payments/usePaymentFeeEstimate';

jest.mock('../src/services/stellar', () => ({ server: { fetchBaseFee: jest.fn() } }));
const fetchFee = server.fetchBaseFee as jest.Mock;

beforeEach(() => { fetchFee.mockReset(); });
afterEach(() => { jest.useRealTimers(); });

it('loads a positive stroop estimate and formats it as XLM without rounding', async () => {
  fetchFee.mockResolvedValue(100);
  const { result } = renderHook(() => usePaymentFeeEstimate('payment-a'));
  expect(result.current.estimate.status).toBe('loading');
  await waitFor(() => expect(result.current.estimate).toEqual({ status: 'available', feeStroops: 100 }));
  expect(feeEstimateValue(result.current.estimate)).toBe('~0.0000100 XLM');
  expect(fetchFee).toHaveBeenCalledTimes(1);
});

it('does not turn missing, zero, fractional or malformed fees into quotes', async () => {
  for (const fee of [null, undefined, 0, -1, 0.5, NaN, Infinity, '100', 0x100000000]) {
    expect(isValidFeeStroops(fee)).toBe(false);
  }
  expect(await readFeeEstimate(async () => null)).toEqual({ status: 'unavailable' });
  expect(feeEstimateValue({ status: 'unavailable' })).toBe('Unavailable');
});

it('keeps transport errors out of state and allows retry without changing payment details', async () => {
  fetchFee.mockRejectedValueOnce(new Error('sensitive server diagnostics')).mockResolvedValueOnce(250);
  const { result } = renderHook(() => usePaymentFeeEstimate('payment-a'));
  await waitFor(() => expect(result.current.estimate).toEqual({ status: 'error' }));
  act(() => result.current.retry());
  expect(result.current.estimate.status).toBe('loading');
  await waitFor(() => expect(result.current.estimate).toEqual({ status: 'available', feeStroops: 250 }));
  expect(fetchFee).toHaveBeenCalledTimes(2);
});

it('bounds an unresponsive request and ignores its late fee', async () => {
  jest.useFakeTimers();
  let resolveFee!: (fee: number) => void;
  const pending = readFeeEstimate(() => new Promise<number>((resolve) => { resolveFee = resolve; }));
  await Promise.resolve();
  jest.advanceTimersByTime(10_000);
  expect(await pending).toEqual({ status: 'unavailable' });
  resolveFee(100);
  await Promise.resolve();
  expect(await pending).toEqual({ status: 'unavailable' });
});

it('replaces stale quotes when the payment changes and ignores older responses', async () => {
  let resolveOld!: (fee: number) => void;
  fetchFee.mockImplementationOnce(() => new Promise<number>((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce(300);
  const { result, rerender } = renderHook(({ key }) => usePaymentFeeEstimate(key), {
    initialProps: { key: 'payment-a' },
  });
  await waitFor(() => expect(fetchFee).toHaveBeenCalledTimes(1));
  rerender({ key: 'payment-b' });
  expect(result.current.estimate.status).toBe('loading');
  await waitFor(() => expect(result.current.estimate).toEqual({ status: 'available', feeStroops: 300 }));
  await act(async () => { resolveOld(100); });
  expect(result.current.estimate).toEqual({ status: 'available', feeStroops: 300 });
});

it('does not request fees for an incomplete review', () => {
  const { result } = renderHook(() => usePaymentFeeEstimate(null));
  expect(result.current.estimate).toEqual({ status: 'unavailable' });
  expect(fetchFee).not.toHaveBeenCalled();
});
