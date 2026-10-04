/**
 * Issue #526 — balance refresh state machine.
 *
 * Focused store coverage only: the production implementation lives in
 * src/store/walletStore.ts. Stellar service calls are mocked so these tests
 * exercise state transitions without network I/O.
 */

import { act } from 'react-test-renderer';

jest.mock('../src/services/stellar');

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: { fromSecret: jest.fn(() => ({ publicKey: () => 'GPUBLIC123' })) },
  Horizon: { Server: jest.fn() },
  TransactionBuilder: jest.fn(),
  Operation: { payment: jest.fn() },
  Asset: { native: jest.fn() },
  Memo: { text: jest.fn() },
  Networks: { TESTNET: 'Test SDF Network ; September 2015' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import { fetchTransactionsPage, fetchXlmBalance } from '../src/services/stellar';
import { useWalletStore } from '../src/store/walletStore';

const mockFetchTransactionsPage = fetchTransactionsPage as jest.MockedFunction<
  typeof fetchTransactionsPage
>;
const mockFetchXlmBalance = fetchXlmBalance as jest.MockedFunction<typeof fetchXlmBalance>;

const EMPTY_PAGE = {
  records: [],
  nextCursor: null,
  hasMore: false,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function resetRefreshState() {
  useWalletStore.setState({
    publicKey: 'GPUBLIC123',
    balance: '0.0000000',
    transactions: [],
    pendingTransactions: {},
    lastRefreshed: null,
    isLoading: false,
    isLoadingMore: false,
    hasMoreTransactions: false,
    nextCursor: null,
    error: null,
    balanceState: 'idle',
    balanceRefreshState: 'idle',
    fundingStatus: 'unknown',
  });
}

describe('issue #526 balance refresh state machine', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRefreshState();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetchXlmBalance.mockResolvedValue('12.3400000');
    mockFetchTransactionsPage.mockResolvedValue(EMPTY_PAGE);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('starts in the idle refresh state', () => {
    const state = useWalletStore.getState();

    expect(state.balanceState).toBe('idle');
    expect(state.balanceRefreshState).toBe('idle');
    expect(state.isLoading).toBe(false);
  });

  it('uses loading when the first refresh has no cached balance', async () => {
    const balanceGate = deferred<string>();
    const pageGate = deferred<typeof EMPTY_PAGE>();
    mockFetchXlmBalance.mockReturnValueOnce(balanceGate.promise);
    mockFetchTransactionsPage.mockReturnValueOnce(pageGate.promise);

    const refresh = useWalletStore.getState().refreshWalletData();

    expect(useWalletStore.getState()).toMatchObject({
      balanceState: 'loading',
      balanceRefreshState: 'loading',
      isLoading: true,
    });

    balanceGate.resolve('12.3400000');
    pageGate.resolve(EMPTY_PAGE);
    await act(async () => {
      await refresh;
    });
  });

  it('marks a cached balance stale while refresh is in flight without blanking it', async () => {
    useWalletStore.setState({
      balance: '9.5000000',
      balanceState: 'available',
      balanceRefreshState: 'refreshed',
      lastRefreshed: 123,
    });

    const balanceGate = deferred<string>();
    const pageGate = deferred<typeof EMPTY_PAGE>();
    mockFetchXlmBalance.mockReturnValueOnce(balanceGate.promise);
    mockFetchTransactionsPage.mockReturnValueOnce(pageGate.promise);

    const refresh = useWalletStore.getState().refreshWalletData();

    expect(useWalletStore.getState()).toMatchObject({
      balance: '9.5000000',
      balanceState: 'available',
      balanceRefreshState: 'stale',
      isLoading: true,
    });

    balanceGate.resolve('10.2500000');
    pageGate.resolve(EMPTY_PAGE);
    await act(async () => {
      await refresh;
    });
  });

  it('moves to refreshed after a successful refresh', async () => {
    await act(async () => {
      await useWalletStore.getState().refreshWalletData();
    });

    const state = useWalletStore.getState();
    expect(state.balance).toBe('12.3400000');
    expect(state.balanceState).toBe('available');
    expect(state.balanceRefreshState).toBe('refreshed');
    expect(state.isLoading).toBe(false);
    expect(state.lastRefreshed).toEqual(expect.any(Number));
  });

  it('moves to failed when a first refresh fails and no cached balance exists', async () => {
    mockFetchXlmBalance.mockRejectedValueOnce(new Error('Horizon down'));

    await act(async () => {
      await useWalletStore.getState().refreshWalletData();
    });

    expect(useWalletStore.getState()).toMatchObject({
      balanceState: 'unavailable',
      balanceRefreshState: 'failed',
      isLoading: false,
      error: 'Horizon down',
    });
  });

  it('moves to offline while preserving a previously refreshed balance', async () => {
    useWalletStore.setState({
      balance: '7.0000000',
      balanceState: 'available',
      balanceRefreshState: 'refreshed',
      lastRefreshed: 456,
    });
    mockFetchXlmBalance.mockRejectedValueOnce(new Error('Network request failed'));

    await act(async () => {
      await useWalletStore.getState().refreshWalletData();
    });

    expect(useWalletStore.getState()).toMatchObject({
      balance: '7.0000000',
      balanceState: 'available',
      balanceRefreshState: 'offline',
      isLoading: false,
      error: 'Network request failed',
    });
  });

  it('coalesces overlapping refresh calls into one in-flight request', async () => {
    const balanceGate = deferred<string>();
    const pageGate = deferred<typeof EMPTY_PAGE>();
    mockFetchXlmBalance.mockReturnValueOnce(balanceGate.promise);
    mockFetchTransactionsPage.mockReturnValueOnce(pageGate.promise);

    const first = useWalletStore.getState().refreshWalletData();
    const second = useWalletStore.getState().refreshWalletData();

    expect(mockFetchXlmBalance).toHaveBeenCalledTimes(1);
    expect(mockFetchTransactionsPage).toHaveBeenCalledTimes(1);

    balanceGate.resolve('8.0000000');
    pageGate.resolve(EMPTY_PAGE);
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(useWalletStore.getState()).toMatchObject({
      balance: '8.0000000',
      balanceState: 'available',
      balanceRefreshState: 'refreshed',
      isLoading: false,
    });
  });
});
