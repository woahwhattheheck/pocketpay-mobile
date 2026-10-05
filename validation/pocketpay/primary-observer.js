// Validation controller only. Observes unchanged dummy transport and real store.
// Never logs seed/secret, SDK error payload, diagnostics text or signed envelope.
const sdk = require('@stellar/stellar-sdk');
const { server } = require('./src/services/stellar');
const { useSignerStore } = require('./src/store/signerStore');
const { useWalletStore } = require('./src/store/walletStore');
const fixture = globalThis.__pocket321NativeFixture;
if (!fixture || process.env.EXPO_PUBLIC_STELLAR_NETWORK !== 'TESTNET') {
  throw new Error('Primary observer requires the pinned dummy Testnet bootstrap.');
}
const counters = { submitObserved: 0, readObserved: 0, secretCalls: 0, signingCalls: 0,
  broadcastAttempts: 0, rpcWrites: 0, walletSaveAttempts: 0 };
const identities = new WeakMap();
let sequence = 0;
let lastLookup = null;
const snapshot = () => {
  const state = useSignerStore.getState();
  const unknown = state.unknownSubmission;
  if (unknown && !identities.has(unknown)) identities.set(unknown, ++sequence);
  return { sourceSha: 'ddd56649099d1fc5763ef29af3bfba0363897bd6', outcome: fixture.outcome,
    counters: { ...counters }, submitCalls: fixture.submitCalls, readCalls: fixture.readCalls,
    transactionHash: fixture.transactionHash, phase: state.phase,
    unknownPresent: Boolean(unknown), unknownIdentity: unknown ? identities.get(unknown) : null,
    unknownHash: unknown && unknown.transactionHash || null, lastLookup };
};
const emit = event => console.info('POCKETPAY_RETRY_PRIMARY_NATIVE_OBSERVER', JSON.stringify({ event, ...snapshot() }));
const originalSubmit = server.submitTransaction;
server.submitTransaction = async function (...args) {
  counters.submitObserved++;
  // Call exactly once with the original object/context; retain result/error identity.
  const pending = originalSubmit.apply(this, args);
  emit('dummy-submit-start');
  try { return await pending; }
  finally { emit('dummy-submit-finished'); }
};
const originalTransactions = server.transactions;
server.transactions = function (...factoryArgs) {
  const factory = originalTransactions.apply(this, factoryArgs);
  return { transaction: requestedHash => {
    const builder = factory.transaction(requestedHash);
    return { call: async (...args) => {
      counters.readObserved++;
      const clock = () => globalThis.performance ? globalThis.performance.now() : Date.now();
      const began = clock();
      const pending = builder.call(...args);
      lastLookup = { requestedHash, responseHash: null, elapsedMs: null };
      emit('dummy-lookup-start');
      try {
        const result = await pending;
        lastLookup = { requestedHash, responseHash: result && result.hash || null,
          successful: result && result.successful, elapsedMs: Math.round(clock() - began) };
        return result;
      } finally {
        lastLookup.elapsedMs = Math.round(clock() - began);
        emit('dummy-lookup-finished');
      }
    } };
  } };
};
const originalSecret = useWalletStore.getState().getSecretKey;
useWalletStore.setState({
  getSecretKey: async (...args) => {
    counters.secretCalls++; emit('dummy-secret-in-memory');
    return originalSecret(...args);
  },
  setWallet: async () => { counters.walletSaveAttempts++; emit('wallet-save-blocked'); return false; },
});
const originalSign = sdk.Keypair.prototype.sign;
sdk.Keypair.prototype.sign = function (...args) {
  counters.signingCalls++; emit('dummy-sign-observed');
  return originalSign.apply(this, args);
};
sdk.rpc.Server.prototype.sendTransaction = async () => {
  counters.rpcWrites++; counters.broadcastAttempts++; emit('rpc-write-blocked');
  throw new Error('Primary native fixture blocks RPC writes.');
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const method = String(init && init.method || input && input.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    counters.broadcastAttempts++; emit('http-write-blocked');
    throw new Error('Primary native fixture blocks HTTP writes.');
  }
  return originalFetch.apply(this, arguments);
};
if (globalThis.XMLHttpRequest) {
  const originalOpen = globalThis.XMLHttpRequest.prototype.open;
  globalThis.XMLHttpRequest.prototype.open = function (method, ...args) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase())) {
      counters.broadcastAttempts++; emit('xhr-write-blocked');
      throw new Error('Primary native fixture blocks native XHR writes.');
    }
    return originalOpen.call(this, method, ...args);
  };
}
useSignerStore.subscribe(() => emit('real-signer-store-change'));
globalThis.__pocketRetryPrimaryObserver = { snapshot };
emit('primary-observer-ready');
