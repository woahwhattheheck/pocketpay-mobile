// Validation controller only. Production screens, hooks and status service stay unchanged.
// The native321 entry/bootstrap and the original gap fixture retain their exact bytes.
const sdk = require('@stellar/stellar-sdk');
const { server } = require('./src/services/stellar');
const { useSignerStore } = require('./src/store/signerStore');
const { useWalletStore } = require('./src/store/walletStore');
const { useAppStore } = require('./src/store/appStore');

module.exports.installRetryGapObserver = function installRetryGapObserver(outcome) {
  if (!['nohash', 'empty', 'mismatch'].includes(outcome)) throw new Error('Unsupported retry gap case.');
  if ((process.env.EXPO_PUBLIC_STELLAR_NETWORK || '').toUpperCase() !== 'TESTNET') {
    throw new Error('The retry gap fixture requires explicit TESTNET configuration.');
  }
  if (!globalThis.__pocket321NativeFixture) throw new Error('Start through the pinned native321 entry.');
  if (globalThis.__pocketRetryGapObserver) {
    if (globalThis.__pocketRetryGapObserver.snapshot().outcome === outcome) return;
    throw new Error('Restart the fixture process for every independent case.');
  }
  const counters = {
    readCalls: 0, readCompleted: 0, mismatchResponses: 0, readErrors: 0,
    secretCalls: 0, signingCalls: 0, submitCalls: 0, rpcWrites: 0,
    broadcastAttempts: 0, blockedFetch: 0, blockedXHR: 0, walletSaveAttempts: 0,
    unknownClears: 0, storeUpdates: 0, reachabilityReads: 0,
  };
  const identities = new WeakMap();
  let identitySequence = 0;
  let lastLookup = null;
  const startedAt = new Date().toISOString();
  const snapshot = () => {
    const state = useSignerStore.getState();
    const submission = state.unknownSubmission;
    if (submission && !identities.has(submission)) identities.set(submission, ++identitySequence);
    return {
      label: 'DUMMY TESTNET / RETRY GAPS / NO SECRET ACCESS, SIGNING OR BROADCAST',
      sourceSha: 'ddd56649099d1fc5763ef29af3bfba0363897bd6', outcome, startedAt,
      counters: { ...counters }, unknownPresent: Boolean(submission),
      unknownIdentity: submission ? identities.get(submission) : null,
      transactionHash: submission && submission.transactionHash || null,
      requestId: submission && submission.review.requestId || null,
      phase: state.phase, lastLookup,
    };
  };
  const emit = (event, details = {}) => console.info('POCKETPAY_RETRY_GAP_NATIVE_OBSERVER',
    JSON.stringify({ event, ...details, ...snapshot() }));
  const reject = (counter, event) => async () => {
    counters[counter]++;
    emit(event);
    throw new Error('Retry gap fixture blocks this write or signing action.');
  };
  useAppStore.setState({ contacts: [] });
  useWalletStore.setState({
    getSecretKey: async () => { counters.secretCalls++; emit('secret-access-blocked'); return null; },
    setWallet: reject('walletSaveAttempts', 'wallet-save-blocked'),
  });
  sdk.Keypair.prototype.sign = function () {
    counters.signingCalls++;
    emit('signing-blocked');
    throw new Error('Cryptographic signing is disabled in retry gap evidence.');
  };
  sdk.rpc.Server.prototype.sendTransaction = reject('rpcWrites', 'rpc-write-blocked');

  // Observe each fixture-provided lookup without changing its response or delay.
  // A WeakMap unwraps prior observed factories when the original fixture restores
  // its saved transactions method at unmount, avoiding recursive wrappers.
  const observedTargets = new WeakMap();
  let observedTransactions;
  const setTransactions = value => {
    const target = observedTargets.get(value) || value;
    if (typeof target !== 'function') throw new Error('Expected a transaction read factory.');
    observedTransactions = function (...factoryArgs) {
      const builder = target.apply(server, factoryArgs);
      return { transaction: requestedHash => {
        const transactionBuilder = builder.transaction(requestedHash);
        return { call: async (...callArgs) => {
          counters.readCalls++;
          const clock = () => globalThis.performance ? globalThis.performance.now() : Date.now();
          const began = clock();
          lastLookup = { requestedHash, responseHash: null, elapsedMs: null };
          emit('lookup-start');
          try {
            const result = await transactionBuilder.call(...callArgs);
            const responseHash = result && typeof result.hash === 'string' ? result.hash : null;
            if (responseHash && responseHash.toLowerCase() !== requestedHash.toLowerCase()) counters.mismatchResponses++;
            lastLookup = { requestedHash, responseHash, successful: result && result.successful,
              elapsedMs: Math.round(clock() - began) };
            counters.readCompleted++;
            emit('lookup-response');
            return result;
          } catch (error) {
            counters.readErrors++;
            lastLookup = { requestedHash, responseHash: null, elapsedMs: Math.round(clock() - began) };
            emit('lookup-error', { errorName: error && error.name || 'Error' });
            throw error;
          }
        } };
      } };
    };
    observedTargets.set(observedTransactions, target);
  };
  setTransactions(server.transactions);
  Object.defineProperty(server, 'transactions', { configurable: true, enumerable: true,
    get: () => observedTransactions, set: setTransactions });
  const rejectSubmit = reject('submitCalls', 'submission-blocked');
  Object.defineProperty(server, 'submitTransaction', { configurable: true, enumerable: true,
    get: () => rejectSubmit, set: () => { /* Keep writes blocked across fixture overrides/restoration. */ } });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url || String(input);
    const method = String(init && init.method || input && input.method || 'GET').toUpperCase();
    if (url === 'https://1.1.1.1' && method === 'HEAD') {
      counters.reachabilityReads++;
      return new Response('', { status: 200 });
    }
    counters.blockedFetch++;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) counters.broadcastAttempts++;
    emit('external-http-blocked');
    throw new Error('External HTTP is disabled in retry gap evidence.');
  };
  if (globalThis.XMLHttpRequest) globalThis.XMLHttpRequest.prototype.open = function (method) {
    counters.blockedXHR++;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase())) counters.broadcastAttempts++;
    emit('native-xhr-blocked');
    throw new Error('Native XHR is disabled in retry gap evidence.');
  };
  let previousUnknown = useSignerStore.getState().unknownSubmission;
  useSignerStore.subscribe(state => {
    counters.storeUpdates++;
    if (previousUnknown && !state.unknownSubmission) counters.unknownClears++;
    previousUnknown = state.unknownSubmission;
    emit('signer-store-observed');
  });
  globalThis.__pocketRetryGapObserver = { snapshot };
  emit('retry-gap-observer-ready');
};
