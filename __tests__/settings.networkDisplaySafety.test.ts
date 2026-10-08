/** Config presentation must not reveal malformed runtime secrets (#396). */
jest.mock('../src/services/vault', () => ({
  isVaultConfigured: jest.fn(() => false),
  getVaultContractId: jest.fn(() => ''),
}));

import { computeNetworkEnvironment } from '../src/features/settings/useNetworkEnvironment';
import { isVaultConfigured, getVaultContractId } from '../src/services/vault';

const mockVaultConfigured = isVaultConfigured as jest.Mock;
const mockVaultContractId = getVaultContractId as jest.Mock;
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL;
  delete process.env.EXPO_PUBLIC_SOROBAN_RPC_URL;
  delete process.env.EXPO_PUBLIC_STELLAR_NETWORK;
  mockVaultConfigured.mockReturnValue(false);
  mockVaultContractId.mockReturnValue('');
});
afterAll(() => { process.env = { ...originalEnv }; });

describe('environment settings and diagnostics redaction (#396)', () => {
  it('never reflects credentials from malformed endpoint URLs', () => {
    const marker = 'SYNTHETIC_URL_SECRET_MARKER';
    process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL = `https://alice:${marker}@%invalid-host`;
    process.env.EXPO_PUBLIC_SOROBAN_RPC_URL = `javascript:${marker}`;

    const env = computeNetworkEnvironment();
    expect(env.horizonHost).toBe('—');
    expect(env.sorobanHost).toBe('—');
    expect(JSON.stringify(env)).not.toContain(marker);
  });

  it('shows ONLY a valid HTTPS hostname even when the URL contains credentials and query tokens', () => {
    const marker = 'SYNTHETIC_QUERY_TOKEN_MARKER';
    process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL =
      `https://alice:password@horizon.example.test/path?token=${marker}`;
    const env = computeNetworkEnvironment();
    expect(env.horizonHost).toBe('horizon.example.test');
    expect(JSON.stringify(env)).not.toContain(marker);
    expect(JSON.stringify(env)).not.toContain('password');
  });

  it('masks a canonical vault ID but never prints short/invalid configuration fragments', () => {
    const canonicalId = `C${'A'.repeat(55)}`;
    mockVaultConfigured.mockReturnValue(true);
    mockVaultContractId.mockReturnValue(canonicalId);
    const valid = computeNetworkEnvironment();
    expect(valid.vaultContractLabel).toBe('CAAAAA…AAAAAA');
    expect(JSON.stringify(valid)).not.toContain(canonicalId);

    const marker = 'SHORT_SECRET_MARKER';
    mockVaultContractId.mockReturnValue(marker);
    const invalid = computeNetworkEnvironment();
    expect(invalid.vaultContractLabel).toBe('Unverified contract ID');
    expect(invalid.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Vault contract ID unverified', severity: 'warning' }),
    ]));
    expect(JSON.stringify(invalid)).not.toContain(marker);
  });

  it('classifies malformed/custom network names without printing the raw environment string', () => {
    const marker = 'SYNTHETIC_NETWORK_SECRET_MARKER';
    process.env.EXPO_PUBLIC_STELLAR_NETWORK = `custom-${marker}`;
    const env = computeNetworkEnvironment();
    expect(env.networkTier).toBe('custom');
    expect(env.networkName).toBe('CUSTOM');
    expect(env.networkLabel).toBe('Custom Network');
    expect(JSON.stringify(env)).not.toContain(marker);
  });

  it('preserves safe standard network labels and warnings', () => {
    process.env.EXPO_PUBLIC_STELLAR_NETWORK = 'MAINNET';
    const env = computeNetworkEnvironment();
    expect(env.networkTier).toBe('mainnet');
    expect(env.networkLabel).toBe('Public Network (Mainnet)');
    expect(env.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Mainnet in use', severity: 'error' }),
    ]));
  });
});
