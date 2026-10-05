// VALIDATION ONLY. Do not commit to the feature PR or ship this initializer.
// Launch Metro with EXPO_PUBLIC_STELLAR_NETWORK=TESTNET. No secret is persisted,
// logged, placed in route parameters, or shown in the UI; no HTTP submission runs.
const StellarSdk = require('@stellar/stellar-sdk');
const { server } = require('./src/services/stellar');
const { useAppStore } = require('./src/store/appStore');
const { useWalletStore } = require('./src/store/walletStore');
const { useAppLockStore } = require('./src/store/appLockStore');

// Deliberately fixed dummy seeds, used only in this isolated Testnet fixture.
const source = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const destination = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2));
const original = {
  loadAccount: server.loadAccount,
  fetchBaseFee: server.fetchBaseFee,
  checkMemoRequired: server.checkMemoRequired,
  submitTransaction: server.submitTransaction,
  transactions: server.transactions,
  app: useAppStore.getState(), wallet: useWalletStore.getState(), lock: useAppLockStore.getState(),
};
const fixture = globalThis.__pocket321NativeFixture = {
  outcome: 'unknown', sourcePublicKey: source.publicKey(), destinationPublicKey: destination.publicKey(),
  submitCalls: 0, readCalls: 0, transactionHash: null,
};

useAppStore.setState({ isInitialized: true, initializeApp: async () => {} });
const initializeWallet = async () => useWalletStore.setState({
  publicKey: source.publicKey(), walletChecked: true, error: null, isLoading: false,
});
useWalletStore.setState({
  publicKey: source.publicKey(), walletChecked: true, error: null, isLoading: false,
  balance: '0.0000000', transactions: [], pendingTransactions: [],
  getSecretKey: async () => source.secret(), loadWalletFromStorage: initializeWallet,
  refreshWalletData: async () => {}, loadMoreTransactions: async () => {},
});
useAppLockStore.setState({
  isLockEnabled: false, isAuthenticated: true, isAuthenticating: false,
  initializeLock: async () => {},
});

// Real production transaction building/signing/classification runs; transport
// is fully controlled and cannot broadcast. The source Account is a dummy ledger.
server.loadAccount = async publicKey => new StellarSdk.Account(publicKey, '0');
server.fetchBaseFee = async () => 100;
server.checkMemoRequired = async () => {};
server.submitTransaction = async transaction => {
  fixture.submitCalls++;
  fixture.transactionHash = transaction.hash().toString('hex');
  await new Promise(resolve => setTimeout(resolve, 1600));
  throw new Error('Dummy transport timed out after submission began.');
};
server.transactions = () => ({ transaction: hash => ({ call: async () => {
  fixture.readCalls++;
  await new Promise(resolve => setTimeout(resolve, 1600));
  if (hash !== fixture.transactionHash) throw new Error('Unexpected dummy transaction hash');
  if (fixture.outcome === 'error') throw new Error('DUMMY_PRIVATE_PROVIDER_PAYLOAD');
  if (fixture.outcome === 'unknown') throw { response: { status: 404 } };
  return { hash, successful: fixture.outcome === 'confirmed' };
} }) });

fixture.restore = () => {
  for (const method of ['loadAccount', 'fetchBaseFee', 'checkMemoRequired', 'submitTransaction', 'transactions']) server[method] = original[method];
  useAppStore.setState(original.app, true);
  useWalletStore.setState(original.wallet, true);
  useAppLockStore.setState(original.lock, true);
  delete globalThis.__pocket321NativeFixture;
};
