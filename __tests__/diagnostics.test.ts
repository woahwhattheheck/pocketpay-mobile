import { getDiagnostics } from '../src/utils/diagnostics';
import { useWalletStore } from '../src/store/walletStore';
import { reportError, clearLastErrorReport } from '../src/utils/errorReporting';
import { FEATURE_FLAGS } from '../src/config/featureFlags';
import * as SecureStore from 'expo-secure-store';

const SAMPLE_SECRET_KEY = 'S' + 'A'.repeat(55);
const SAMPLE_PUBLIC_KEY = 'G' + 'B'.repeat(55);

describe('getDiagnostics', () => {
  const originalNetwork = process.env.EXPO_PUBLIC_STELLAR_NETWORK;

  afterEach(() => {
    process.env.EXPO_PUBLIC_STELLAR_NETWORK = originalNetwork;
    clearLastErrorReport();
    useWalletStore.setState({ error: null });
    jest.restoreAllMocks();
  });

  it('does not export wallet error text containing a Stellar secret key', async () => {
    useWalletStore.setState({ error: `Signing failed for secret ${SAMPLE_SECRET_KEY}` });

    const raw = await getDiagnostics();

    expect(raw).not.toContain(SAMPLE_SECRET_KEY);
    expect(JSON.parse(raw).walletState.lastError).toBe('Details omitted for privacy');
  });

  it('does not export wallet error text containing a Stellar public key', async () => {
    useWalletStore.setState({ error: `Account not found: ${SAMPLE_PUBLIC_KEY}` });

    const raw = await getDiagnostics();

    expect(raw).not.toContain(SAMPLE_PUBLIC_KEY);
    expect(JSON.parse(raw).walletState.lastError).toBe('Details omitted for privacy');
  });

  it('never includes a raw secret or public key anywhere in the payload, regardless of source', async () => {
    // Even if some future field accidentally included one of these directly
    // (not just through walletState.error), the full serialized payload
    // must never contain an unredacted key. This is a blanket safety net,
    // not just a check on the one field that's redacted today.
    useWalletStore.setState({ error: `${SAMPLE_SECRET_KEY} and ${SAMPLE_PUBLIC_KEY}` });

    const raw = await getDiagnostics();

    expect(raw).not.toMatch(/\bS[A-Z0-9]{55}\b/);
    expect(raw).not.toMatch(/\bG[A-Z0-9]{55}\b/);
  });

  it('classifies network failures without exposing raw wallet errors in the category', async () => {
    useWalletStore.setState({ error: 'Network request failed for a private endpoint' });

    const parsed = JSON.parse(await getDiagnostics());

    expect(parsed.networkHealth).toEqual({
      classifiedError: 'connection',
      hasError: true,
    });
    expect(parsed.networkHealth.classifiedError).not.toContain('endpoint');
  });

  it('never exports opaque URL tokens or untrusted reporter fields as error details', async () => {
    const token = 'opaque-client-credential-7654-not-a-wallet-key';
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    useWalletStore.setState({
      error: 'Network request failed: https://private.example/?access_token=' + token,
    });
    reportError(new Error('Authorization bearer ' + token), {
      source: 'injected-' + token,
      isFatal: false,
    });

    const raw = await getDiagnostics();
    const parsed = JSON.parse(raw);

    expect(raw).not.toContain(token);
    expect(parsed.networkHealth.classifiedError).toBe('connection');
    expect(parsed.walletState.lastError).toBe('Details omitted for privacy');
    expect(parsed.lastReportedError).toMatchObject({
      source: 'Other',
      name: 'Error',
      message: 'Details omitted for privacy',
    });
  });

  it('does not echo malformed endpoint URLs into the support report', async () => {
    const previousUrl = process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL;
    const marker = 'private-endpoint-token-678';
    try {
      process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL = 'invalid url/?access_token=' + marker;
      const raw = await getDiagnostics();
      const parsed = JSON.parse(raw);

      expect(parsed.network.horizonHost).toBe('Invalid URL');
      expect(raw).not.toContain(marker);
    } finally {
      if (previousUrl === undefined) {
        delete process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL;
      } else {
        process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL = previousUrl;
      }
    }
  });

  it('reports null for lastError when the wallet store has no error', async () => {
    useWalletStore.setState({ error: null });

    const parsed = JSON.parse(await getDiagnostics());

    expect(parsed.walletState.lastError).toBeNull();
  });

  it('includes network tier and label derived from EXPO_PUBLIC_STELLAR_NETWORK', async () => {
    process.env.EXPO_PUBLIC_STELLAR_NETWORK = 'TESTNET';
    const testnetParsed = JSON.parse(await getDiagnostics());
    expect(testnetParsed.network.tier).toBe('testnet');
    expect(testnetParsed.network.label).toBe('Testnet');

    process.env.EXPO_PUBLIC_STELLAR_NETWORK = 'PUBLIC';
    const mainnetParsed = JSON.parse(await getDiagnostics());
    expect(mainnetParsed.network.tier).toBe('mainnet');
    expect(mainnetParsed.network.label).toBe('Public Network (Mainnet)');
  });

  it('does not export free-form custom network labels from build configuration', async () => {
    const marker = 'private-custom-endpoint-token-12345';
    process.env.EXPO_PUBLIC_STELLAR_NETWORK = `CUSTOM-${marker}`;

    const raw = await getDiagnostics();
    const parsed = JSON.parse(raw);

    expect(parsed.network.tier).toBe('custom');
    expect(parsed.network.label).toBe('Custom Network');
    expect(raw).not.toContain(marker);
  });

  it('exposes only hostnames for Horizon/Soroban, never a full URL', async () => {
    const parsed = JSON.parse(await getDiagnostics());

    expect(parsed.network.horizonHost).not.toMatch(/^https?:\/\//);
    expect(parsed.network.sorobanHost).not.toMatch(/^https?:\/\//);
  });

  it('reports the vault as mock mode with no raw contract ID when unconfigured', async () => {
    const parsed = JSON.parse(await getDiagnostics());

    expect(parsed.network.vaultMode).toBe('mock');
    expect(parsed.network.vaultContractLabel).toBe('Mock (no contract)');
  });

  it('includes every configured feature flag with its enabled state', async () => {
    const parsed = JSON.parse(await getDiagnostics());

    for (const [key, flag] of Object.entries(FEATURE_FLAGS)) {
      expect(parsed.featureFlags[key]).toBe(flag.enabled);
    }
  });

  it('reports secure storage as available when the platform check succeeds', async () => {
    jest.spyOn(SecureStore, 'isAvailableAsync').mockResolvedValueOnce(true);

    const parsed = JSON.parse(await getDiagnostics());

    expect(parsed.storage.secureStoreAvailable).toBe(true);
  });

  it('reports secure storage as unavailable rather than throwing when the platform check fails', async () => {
    jest.spyOn(SecureStore, 'isAvailableAsync').mockRejectedValueOnce(new Error('no keychain'));

    const parsed = JSON.parse(await getDiagnostics());

    expect(parsed.storage.secureStoreAvailable).toBe(false);
  });

  it('includes the most recent reported error without its raw message', async () => {
    reportError(new Error(`boom ${SAMPLE_SECRET_KEY}`), { source: 'GlobalJsHandler', isFatal: true });

    const parsed = JSON.parse(await getDiagnostics());

    expect(parsed.lastReportedError).not.toBeNull();
    expect(parsed.lastReportedError.source).toBe('GlobalJsHandler');
    expect(parsed.lastReportedError.isFatal).toBe(true);
    expect(parsed.lastReportedError.message).toBe('Details omitted for privacy');
  });

  it('uses balance fetch readiness, not the balance amount, in the support report', async () => {
    const previous = useWalletStore.getState();
    try {
      useWalletStore.setState({ balance: '0.0000000', balanceState: 'available' });
      const loaded = JSON.parse(await getDiagnostics());
      expect(loaded.walletState.isBalanceLoaded).toBe(true);

      useWalletStore.setState({ balance: '25.0000000', balanceState: 'unavailable' });
      const failedRefresh = JSON.parse(await getDiagnostics());
      expect(failedRefresh.walletState.isBalanceLoaded).toBe(false);
      expect(JSON.stringify(failedRefresh)).not.toContain('25.0000000');
    } finally {
      useWalletStore.setState({ balance: previous.balance, balanceState: previous.balanceState });
    }
  });

  it('never exposes the wallet balance or full transaction list, only counts/booleans', async () => {
    useWalletStore.setState({
      balance: '1234.5670000',
      transactions: [{ id: '1' } as never, { id: '2' } as never],
    });

    const raw = await getDiagnostics();
    const parsed = JSON.parse(raw);

    expect(raw).not.toContain('1234.5670000');
    expect(parsed.walletState.transactionsCount).toBe(2);
    expect(parsed.walletState).not.toHaveProperty('balance');
    expect(parsed.walletState).not.toHaveProperty('transactions');
  });
});
