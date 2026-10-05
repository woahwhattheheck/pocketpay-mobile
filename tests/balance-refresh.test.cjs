/* Run: node --test tests/balance-refresh.test.cjs
 * Isolated store tests: Horizon, storage, and the Zustand get/set boundary are
 * doubles. The production reducer and store action implementations run directly.
 * UI rendering/device behavior is covered separately, not by this harness.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loadSource(relativePath, dependencies = {}) {
  const filename = path.join(root, relativePath);
  const loaded = new Module(filename, module);
  loaded.require = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency in isolated test: ${name}`);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText, filename);
  return loaded.exports;
}
const model = loadSource('src/types/balanceRefresh.ts');
const { initialBalanceRefreshState: initial, transitionBalanceRefresh: transition,
  balanceValueState, describeBalanceRefresh, withBalanceRefreshTimeout,
  BALANCE_STALE_AFTER_MS } = model;
const start = (state, requestId = 1) => transition(state, { type: 'start', requestId });
const success = (state, requestId = 1, now = 100) => transition(state, { type: 'succeeded', requestId, now });
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const page = (id = 'tx') => ({ records: [{ id }], nextCursor: null, hasMore: false });

function makeStore() {
  const calls = { balance: 0, history: 0 };
  const reads = { balance: async () => '12.0000000', history: async () => page() };
  const service = {
    fetchXlmBalance: key => { calls.balance++; return reads.balance(key); },
    fetchTransactionsPage: (...args) => { calls.history++; return reads.history(...args); },
    fetchAccountDetails: async () => ({}), fundWithFriendbot: async () => {},
  };
  const store = loadSource('src/store/walletStore.ts', {
    zustand: { create: initialize => {
      let state;
      const get = () => state;
      const set = update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
      state = initialize(set, get);
      return { getState: get, setState: set };
    } },
    'expo-secure-store': { setItemAsync: async () => {}, deleteItemAsync: async () => {} },
    '@react-native-async-storage/async-storage': { default: { removeItem: async () => {} } },
    '@stellar/stellar-sdk': {},
    '../services/stellar': service,
    '../types/balanceRefresh': model,
    '../utils/walletStorageErrors': {},
  }).useWalletStore;
  store.setState({ publicKey: 'TEST_ACCOUNT_A' });
  return { store, calls, reads };
}

test('idle/loading do not manufacture an available zero balance', () => {
  assert.equal(initial().status, 'idle');
  assert.equal(balanceValueState(initial()), 'idle');
  const pending = start(initial());
  assert.equal(pending.status, 'loading');
  assert.equal(balanceValueState(pending), 'loading');
});

test('successful reads become stale exactly at the age boundary', () => {
  const fresh = success(start(initial()), 1, 0);
  assert.equal(fresh.status, 'refreshed');
  assert.equal(balanceValueState(fresh), 'available');
  assert.equal(transition(fresh, { type: 'age', now: BALANCE_STALE_AFTER_MS - 1 }), fresh);
  assert.equal(transition(fresh, { type: 'age', now: BALANCE_STALE_AFTER_MS }).status, 'stale');
});

test('failure retains the successful value timestamp and allows a new attempt', () => {
  const failed = transition(start(success(start(initial())), 2), { type: 'failed', requestId: 2 });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.lastSucceededAt, 100);
  assert.equal(balanceValueState(failed), 'available');
  assert.match(describeBalanceRefresh(failed), /last successful balance/);
  assert.equal(success(start(failed, 3), 3, 200).lastSucceededAt, 200);
  assert.equal(balanceValueState(transition(start(initial()), { type: 'failed', requestId: 1 })), 'unavailable');
});

test('offline invalidates a completion and reconnect does not claim freshness', () => {
  const offline = transition(start(success(start(initial())), 2), { type: 'offline' });
  assert.equal(success(offline, 2), offline);
  assert.equal(start(offline, 3), offline);
  assert.equal(transition(offline, { type: 'online' }).status, 'stale');
  const empty = transition(initial(), { type: 'offline' });
  assert.equal(balanceValueState(empty), 'unavailable');
  assert.equal(transition(empty, { type: 'online' }).status, 'idle');
});

test('stale completions and non-increasing request IDs cannot overwrite newer work', () => {
  const pending = start(start(initial()), 2);
  assert.equal(success(pending, 1), pending);
  assert.equal(transition(pending, { type: 'failed', requestId: 1 }), pending);
  assert.equal(start(pending, 2), pending);
  assert.equal(success(pending, 2).status, 'refreshed');
});

test('hung reads reject at the timeout, and late resolution cannot replace the outcome', async () => {
  const read = defer();
  const bounded = withBalanceRefreshTimeout(read.promise, 5);
  await assert.rejects(bounded, /timed out/);
  read.resolve('late');
  await assert.rejects(bounded, /timed out/);
});

test('concurrent refresh calls share exactly one balance and one history request', async () => {
  const { store, calls, reads } = makeStore();
  const read = defer(); reads.balance = () => read.promise;
  const first = store.getState().refreshWalletData();
  const second = store.getState().refreshWalletData();
  assert.equal(first, second);
  read.resolve('9.0000000');
  await first;
  assert.deepEqual(calls, { balance: 1, history: 1 });
  assert.equal(store.getState().balance, '9.0000000');
  assert.equal(store.getState().balanceRefresh.status, 'refreshed');
});

test('failed refresh retains the balance and timestamp; explicit retry recovers', async () => {
  const { store, reads } = makeStore();
  await store.getState().refreshWalletData();
  const previous = store.getState();
  reads.balance = async () => { throw new Error('Horizon unavailable'); };
  const retry = store.getState().refreshWalletData();
  assert.equal(store.getState().balanceState, 'available');
  await retry;
  assert.equal(store.getState().balance, previous.balance);
  assert.equal(store.getState().lastRefreshed, previous.lastRefreshed);
  assert.equal(store.getState().balanceRefresh.status, 'failed');
  reads.balance = async () => '20.0000000';
  await store.getState().refreshWalletData();
  assert.equal(store.getState().balanceRefresh.status, 'refreshed');
  assert.equal(store.getState().balance, '20.0000000');
});

test('history failure preserves pagination without discarding a successful balance', async () => {
  const { store, reads } = makeStore();
  store.setState({ transactions: [{ id: 'cached' }], nextCursor: 'cursor', hasMoreTransactions: true });
  reads.history = async () => { throw new Error('History unavailable'); };
  await store.getState().refreshWalletData();
  const state = store.getState();
  assert.equal(state.balanceRefresh.status, 'refreshed');
  assert.equal(state.balance, '12.0000000');
  assert.deepEqual(state.transactions, [{ id: 'cached' }]);
  assert.equal(state.nextCursor, 'cursor');
  assert.equal(state.hasMoreTransactions, true);
  assert.equal(state.error, 'History unavailable');
});

test('wallet replacement and same-key restoration reject the previous wallet response', async () => {
  const { store, reads } = makeStore();
  const old = defer(); reads.balance = () => old.promise;
  const previous = store.getState().refreshWalletData();
  await Promise.resolve(); await Promise.resolve();
  await store.getState().setWallet('TEST_ACCOUNT_B', 'TEST_FIXTURE');
  await store.getState().setWallet('TEST_ACCOUNT_A', 'TEST_FIXTURE');
  reads.balance = async () => '30.0000000';
  await store.getState().refreshWalletData();
  old.resolve('999.0000000'); await previous;
  assert.equal(store.getState().publicKey, 'TEST_ACCOUNT_A');
  assert.equal(store.getState().balance, '30.0000000');
});

test('offline performs no reads and invalidates a pending refresh until reconnection', async () => {
  const { store, calls, reads } = makeStore();
  await store.getState().refreshWalletData();
  const old = defer(); reads.balance = () => old.promise;
  const pending = store.getState().refreshWalletData();
  await Promise.resolve(); await Promise.resolve();
  store.getState().setBalanceConnectivity(false);
  const count = { ...calls };
  await store.getState().refreshWalletData();
  assert.deepEqual(calls, count);
  old.resolve('999.0000000'); await pending;
  assert.equal(store.getState().balanceRefresh.status, 'offline');
  assert.equal(store.getState().balance, '12.0000000');
  store.getState().setBalanceConnectivity(true);
  assert.equal(store.getState().balanceRefresh.status, 'stale');
  reads.balance = async () => '31.0000000';
  await store.getState().refreshWalletData();
  assert.equal(store.getState().balance, '31.0000000');
});

test('a late older pagination page cannot overwrite a newer refresh', async () => {
  const { store, reads } = makeStore();
  store.setState({ transactions: [{ id: 'old' }], nextCursor: 'cursor', hasMoreTransactions: true });
  const older = defer();
  reads.history = (_, __, cursor) => cursor ? older.promise : Promise.resolve(page('fresh'));
  const pagination = store.getState().loadMoreTransactions();
  await store.getState().refreshWalletData();
  older.resolve(page('obsolete'));
  await pagination;
  assert.deepEqual(store.getState().transactions, [{ id: 'fresh' }]);
  assert.equal(store.getState().isLoadingMore, false);
});
