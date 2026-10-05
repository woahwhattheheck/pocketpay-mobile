// Validation only: extend the memory-only, broadcast-blocked vault initializer.
const StellarSdk = require('@stellar/stellar-sdk');
const stellar = require('./src/services/stellar');
const { Share } = require('react-native');
const Clipboard = require('expo-clipboard');
const { useWalletStore } = require('./src/store/walletStore');
const { useAppStore } = require('./src/store/appStore');
const { useContactStore } = require('./src/features/contacts/contactStore');
const source = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11));
const destination = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 12));
const generated = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 23));
const counters = {
  generateKeypair: 0, walletSaveAttempts: 0, backupAttempts: 0, clipboardAttempts: 0,
  historyMounts: 0, historyUnmounts: 0, historyHydrations: 0, historyRemovals: 0,
  historyRefreshes: 0, shareCalls: 0, shareStringPayload: 0, shareRedactedPayload: 0,
  shareSheetReturns: 0, diagnosticMounts: 0, fallbackMounts: 0,
  pickerSelect: 0, pickerCancel: 0, pickerAddNew: 0, pickerEdit: 0,
  signReviewRouteEntries: 0, ledgerReads: 0,
};
const listeners = new Set();
let ready = false;
const fixture = globalThis.__pocketBaselineNativeFixture = {
  counters,
  publicKey: source.publicKey(), destinationPublicKey: destination.publicKey(),
  snapshot: () => ({
    label: 'DUMMY TESTNET / MEMORY ONLY / NO SIGNING OR BROADCAST', ready,
    counters: { ...counters }, walletPresent: Boolean(useWalletStore.getState().publicKey),
    transport: globalThis.__pocketVaultNativeFixture.snapshot(),
  }),
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  log: (event, details = {}) => {
    const state = fixture.snapshot();
    console.info('POCKETPAY_BASELINE_NATIVE_FIXTURE', JSON.stringify({ event, ...details, ...state }));
    listeners.forEach(listener => listener(state));
  },
  setHistoryWallet: present => {
    counters[present ? 'historyHydrations' : 'historyRemovals']++;
    useWalletStore.setState({
      publicKey: present ? source.publicKey() : null, walletChecked: true, error: null,
      transactions: present ? [{
        id: 'DUMMY_NATIVE_HISTORY_PAYMENT', type: 'payment', asset_type: 'native',
        amount: '10.0000000', from: destination.publicKey(), to: source.publicKey(),
        source_account: destination.publicKey(), created_at: '2026-10-05T00:00:00Z',
        transaction_hash: 'a'.repeat(64), status: 'confirmed',
      }] : [],
      isLoading: false, isLoadingMore: false, hasMoreTransactions: false, nextCursor: null,
    });
    fixture.log(present ? 'history-hydrated' : 'history-missing');
  },
};

// Fixed dummy key generation keeps the real Create screen and masked reveal UI.
// Any attempted save returns a real failure state without touching SecureStore.
const dummyGenerateKeypair = () => {
  counters.generateKeypair++;
  fixture.log('dummy-keypair-generated');
  return { publicKey: generated.publicKey(), secretKey: generated.secret() };
};
stellar.generateKeypair = dummyGenerateKeypair;
if (stellar.generateKeypair !== dummyGenerateKeypair) throw new Error('Dummy key-generation guard did not install.');
useWalletStore.setState({
  // Root initialization must preserve the deliberate missing-wallet History
  // state rather than asynchronously replacing it with the seeded wallet.
  loadWalletFromStorage: async () => {
    useWalletStore.setState({ walletChecked: true, isLoading: false });
    return Boolean(useWalletStore.getState().publicKey);
  },
  setWallet: async () => { counters.walletSaveAttempts++; fixture.log('wallet-save-blocked'); return false; },
  markBackupPending: async () => { counters.backupAttempts++; fixture.log('backup-write-blocked'); },
  refreshWalletData: async () => { counters.historyRefreshes++; fixture.log('memory-history-refresh'); },
});
const rejectClipboard = async () => {
  counters.clipboardAttempts++;
  fixture.log('clipboard-write-blocked');
  throw new Error('Clipboard writes are disabled in this dummy evidence fixture.');
};
Clipboard.setStringAsync = rejectClipboard;
if (Clipboard.setStringAsync !== rejectClipboard) throw new Error('Clipboard guard did not install.');

// Read-only dummy ledger data permits the real review screen to render after
// SignConfirmation navigation. The prior initializer still blocks all writes.
stellar.server.loadAccount = async publicKey => {
  counters.ledgerReads++;
  return new StellarSdk.Account(publicKey, '0');
};
stellar.server.fetchBaseFee = async () => 100;
stellar.server.checkMemoRequired = async () => {};

// Observe and validate the resolved payload, then invoke the REAL native sheet.
// The operator must cancel it; no external recipient is selected by the fixture.
const nativeShare = Share.share;
const observeNativeShare = async (content, options) => {
  counters.shareCalls++;
  const message = content && content.message;
  if (typeof message !== 'string') {
    fixture.log('share-non-string-blocked');
    throw new Error('Diagnostics must resolve to text before native sharing.');
  }
  counters.shareStringPayload++;
  const data = JSON.parse(message);
  const redacted = !message.includes(source.publicKey()) && !message.includes(destination.publicKey()) &&
    !message.includes(generated.secret()) &&
    !Object.prototype.hasOwnProperty.call(data.walletState || {}, 'balance') &&
    !Object.prototype.hasOwnProperty.call(data.walletState || {}, 'publicKey');
  if (!redacted) throw new Error('Unexpected unredacted dummy diagnostics payload.');
  counters.shareRedactedPayload++;
  fixture.log('native-share-sheet-requested', { payloadCharacters: message.length, redacted });
  const result = await nativeShare(content, options);
  counters.shareSheetReturns++;
  fixture.log('native-share-sheet-returned', { action: result.action });
  return result;
};
Share.share = observeNativeShare;
if (Share.share !== observeNativeShare) throw new Error('Native Share observer did not install.');

// Persist middleware uses the already installed Map-backed AsyncStorage adapter.
// Wait for hydration before rendering the picker so it cannot overwrite seeds.
Promise.resolve(useContactStore.persist.rehydrate()).then(() => {
  useContactStore.setState({
    contacts: [{ id: 'DUMMY_ALICE', name: 'DUMMY Alice', address: destination.publicKey() }],
    recentRecipients: [destination.publicKey()],
  });
  useAppStore.setState({ contacts: [{
    id: 'DUMMY_ALICE', name: 'DUMMY Alice', publicKey: destination.publicKey(),
  }] });
  ready = true;
  fixture.log('baseline-bootstrap-ready');
}).catch(error => {
  fixture.log('baseline-bootstrap-failed', { errorName: error && error.name || 'Error' });
});
