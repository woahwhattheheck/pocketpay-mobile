// VALIDATION ONLY: memory-only dummy Testnet data; no signing or network writes.
// Install this file at the validation checkout root, after shim, before router.
const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const transport = {
  fetch: globalThis.fetch,
  xhrOpen: globalThis.XMLHttpRequest && globalThis.XMLHttpRequest.prototype.open,
};
const storageMethods = ['getItem', 'setItem', 'removeItem', 'clear', 'getAllKeys',
  'multiGet', 'multiSet', 'multiRemove', 'mergeItem', 'multiMerge'];
const originalStorage = Object.fromEntries(storageMethods.map(name => [name, AsyncStorage[name]]));
const memory = new Map([
  ['@pocketpay_vault_intro_seen', 'true'],
  ['@pocketpay_contacts', '[]'],
  ['@pocketpay_theme', '"dark"'],
  ['@pocketpay_vault_locks', '[]'],
]);
const counters = {
  addLock: 0, deposit: 0, withdraw: 0, secretAccess: 0,
  broadcastAttempts: 0, blockedFetch: 0, blockedXHR: 0,
  balanceReads: 0, lockReads: 0, reachabilityReads: 0, passphraseReads: 0,
};
const listeners = new Set();
let lastLock = null;
const snapshot = () => ({
  label: 'DUMMY TESTNET / MEMORY ONLY / BROADCAST DISABLED',
  ...counters,
  lastLock,
  persistedLocks: JSON.parse(memory.get('@pocketpay_vault_locks') || '[]').length,
});
const emit = event => {
  const state = snapshot();
  console.info('POCKETPAY_VAULT_NATIVE_FIXTURE', JSON.stringify({ event, ...state }));
  listeners.forEach(listener => listener(state));
};
const rejectAction = action => async () => {
  counters[action]++;
  emit(`blocked-${action}`);
  throw new Error(`Dummy native fixture blocks ${action}; use only Confirm Lock.`);
};
const rejectBroadcast = async () => {
  counters.broadcastAttempts++;
  emit('blocked-broadcast');
  throw new Error('Broadcast disabled in dummy native vault fixture.');
};

// Replace native persistence before requiring stores. All writes stay in Map.
AsyncStorage.getItem = async key => memory.get(key) ?? null;
AsyncStorage.setItem = async (key, value) => {
  // Retain a visible in-flight state for a screenshot of the real modal.
  if (key === '@pocketpay_vault_locks') await new Promise(resolve => setTimeout(resolve, 1200));
  memory.set(key, String(value));
};
AsyncStorage.removeItem = async key => { memory.delete(key); };
AsyncStorage.clear = async () => { memory.clear(); };
AsyncStorage.getAllKeys = async () => [...memory.keys()];
AsyncStorage.multiGet = async keys => keys.map(key => [key, memory.get(key) ?? null]);
AsyncStorage.multiSet = async pairs => { pairs.forEach(([key, value]) => memory.set(key, String(value))); };
AsyncStorage.multiRemove = async keys => { keys.forEach(key => memory.delete(key)); };
AsyncStorage.mergeItem = async (key, value) => {
  memory.set(key, JSON.stringify({ ...JSON.parse(memory.get(key) || '{}'), ...JSON.parse(value) }));
};
AsyncStorage.multiMerge = async pairs => {
  for (const [key, value] of pairs) await AsyncStorage.mergeItem(key, value);
};

// Preserve the real connectivity hook; its transport receives canned HEAD data.
// Every other fetch and every native XHR request is rejected before dispatch.
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url || String(input);
  const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  if (url === 'https://1.1.1.1' && method === 'HEAD') {
    counters.reachabilityReads++;
    return new Response('', { status: 200 });
  }
  counters.blockedFetch++;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) counters.broadcastAttempts++;
  emit('blocked-fetch');
  throw new Error('External HTTP disabled in dummy native vault fixture.');
};
if (globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest.prototype.open = function(method) {
    counters.blockedXHR++;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase())) counters.broadcastAttempts++;
    emit('blocked-xhr');
    throw new Error('Native XHR disabled in dummy native vault fixture.');
  };
}

const StellarSdk = require('@stellar/stellar-sdk');
const stellar = require('./src/services/stellar');
const { useAppStore } = require('./src/store/appStore');
const { useWalletStore } = require('./src/store/walletStore');
const { useAppLockStore } = require('./src/store/appLockStore');
const { useVaultStore } = require('./src/store/vaultStore');
const { useVaultStore: useWithdrawalStore } = require('./src/features/vault/vaultStore');
if ((process.env.EXPO_PUBLIC_STELLAR_NETWORK || 'TESTNET').toUpperCase() !== 'TESTNET') {
  throw new Error('This native fixture requires EXPO_PUBLIC_STELLAR_NETWORK=TESTNET.');
}
if (['false', '0'].includes((process.env.EXPO_PUBLIC_VAULT_ENABLED || 'true').toLowerCase())) {
  throw new Error('This native fixture requires EXPO_PUBLIC_VAULT_ENABLED=true.');
}
if (process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE &&
    process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE !== StellarSdk.Networks.TESTNET) {
  throw new Error('The native fixture requires the Testnet network passphrase.');
}
const publicKey = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11)).publicKey();
const original = {
  app: useAppStore.getState(), wallet: useWalletStore.getState(), lock: useAppLockStore.getState(),
  vault: useVaultStore.getState(), withdrawal: useWithdrawalStore.getState(),
  root: stellar.server.root, submit: stellar.server.submitTransaction,
  rpcSend: StellarSdk.rpc.Server.prototype.sendTransaction,
  mockDeposit: stellar.mockDepositToVault, mockWithdraw: stellar.mockWithdrawFromVault,
};
stellar.server.root = async () => {
  counters.passphraseReads++;
  return { network_passphrase: StellarSdk.Networks.TESTNET };
};
stellar.server.submitTransaction = rejectBroadcast;
StellarSdk.rpc.Server.prototype.sendTransaction = rejectBroadcast;
const blockedDeposit = rejectAction('deposit');
const blockedWithdraw = rejectAction('withdraw');
stellar.mockDepositToVault = blockedDeposit;
stellar.mockWithdrawFromVault = blockedWithdraw;
if (stellar.mockDepositToVault !== blockedDeposit) throw new Error('Dummy deposit guard did not install.');
if (stellar.mockWithdrawFromVault !== blockedWithdraw) throw new Error('Dummy withdrawal guard did not install.');

const initializeWallet = async () => {
  useWalletStore.setState({ publicKey, walletChecked: true, error: null, isLoading: false });
  return true;
};
useAppStore.setState({
  contacts: [], themeMode: 'dark', isInitialized: true,
  initializeApp: async () => { useAppStore.setState({ isInitialized: true }); },
});
useWalletStore.setState({
  publicKey, walletChecked: true, error: null, isLoading: false, isFunding: false,
  balance: '100.0000000', transactions: [], pendingTransactions: {},
  fundingStatus: 'funded', balanceState: 'available', showBackupReminder: false,
  getSecretKey: async () => { counters.secretAccess++; emit('blocked-secret-access'); return null; },
  loadWalletFromStorage: initializeWallet,
  refreshWalletData: async () => {}, loadMoreTransactions: async () => {},
  checkFundingStatus: async () => {}, fundWallet: rejectBroadcast,
  setWallet: rejectBroadcast,
});
useAppLockStore.setState({
  isLockEnabled: false, isAuthenticated: true, isAuthenticating: false,
  initializeLock: async () => {},
});
useVaultStore.setState({
  balance: '25.0000000', locks: [], isConfigured: false, contractId: '',
  isLoadingBalance: false, isLoadingLocks: false, isSubmitting: false,
  balanceError: null, vaultError: null,
  loadBalance: async () => {
    counters.balanceReads++;
    useVaultStore.setState({ balance: '25.0000000', isLoadingBalance: false, balanceError: null });
  },
  loadLocks: async () => {
    counters.lockReads++;
    await original.vault.loadLocks();
  },
  addLock: async (amount, unlockDate) => {
    counters.addLock++;
    lastLock = { amount, unlockDate, receivedAt: new Date().toISOString() };
    emit('addLock-enter');
    // Execute the actual production store action against the memory adapter.
    try { await original.vault.addLock(amount, unlockDate); }
    finally { emit('addLock-exit'); }
  },
  deposit: rejectAction('deposit'), withdraw: rejectAction('withdraw'),
  unlockLock: rejectAction('withdraw'), withdrawMaturedLock: rejectAction('withdraw'),
});
useWithdrawalStore.setState({
  vaultBalance: '0.0000000', maturedLocks: [], isWithdrawing: false, withdrawalError: null,
  selectedWithdrawalType: null, selectedLockId: null,
  fetchVaultDetails: async () => {}, confirmWithdrawal: rejectAction('withdraw'),
});
globalThis.__pocketVaultNativeFixture = {
  snapshot,
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  restore: () => {
    storageMethods.forEach(name => { AsyncStorage[name] = originalStorage[name]; });
    globalThis.fetch = transport.fetch;
    if (transport.xhrOpen) globalThis.XMLHttpRequest.prototype.open = transport.xhrOpen;
    stellar.server.root = original.root;
    stellar.server.submitTransaction = original.submit;
    StellarSdk.rpc.Server.prototype.sendTransaction = original.rpcSend;
    stellar.mockDepositToVault = original.mockDeposit;
    stellar.mockWithdrawFromVault = original.mockWithdraw;
    useAppStore.setState(original.app, true);
    useWalletStore.setState(original.wallet, true);
    useAppLockStore.setState(original.lock, true);
    useVaultStore.setState(original.vault, true);
    useWithdrawalStore.setState(original.withdrawal, true);
    listeners.clear();
    delete globalThis.__pocketVaultNativeFixture;
  },
};
emit('bootstrap-ready');
