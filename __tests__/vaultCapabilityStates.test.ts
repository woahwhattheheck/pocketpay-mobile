import {
  evaluateVaultCapabilities,
  getActionUnsupportedReason,
  isActionSupported,
  type VaultCapabilityInput,
} from '../src/utils/vaultCapabilities';

const READY: VaultCapabilityInput = {
  hasWallet: true,
  isContractConfigured: true,
  isFeatureEnabled: true,
  isSdkReady: true,
  isLoading: false,
  isExperimentalEnabled: false,
  error: null,
};

describe('vault capability states', () => {
  it('returns loading while readiness data is still resolving', () => {
    const capabilities = evaluateVaultCapabilities({
      ...READY,
      isLoading: true,
    });

    expect(capabilities.deposit.status).toBe('loading');
    expect(isActionSupported(capabilities, 'deposit')).toBe(false);
  });

  it('returns unavailable when the vault feature is disabled', () => {
    const capabilities = evaluateVaultCapabilities({
      ...READY,
      isFeatureEnabled: false,
    });

    expect(capabilities.withdraw.status).toBe('unavailable');
    expect(getActionUnsupportedReason(capabilities, 'withdraw')).toBe(
      'Vault feature is disabled',
    );
  });

  it('returns an error state when the runtime capability check fails', () => {
    const capabilities = evaluateVaultCapabilities({
      ...READY,
      error: 'RPC balance request failed',
    });

    expect(capabilities.lock.status).toBe('error');
    expect(getActionUnsupportedReason(capabilities, 'lock')).toBe(
      'Vault capability check failed',
    );
  });

  it('marks preview mode experimental while keeping actions usable', () => {
    const capabilities = evaluateVaultCapabilities({
      ...READY,
      isContractConfigured: false,
    });

    expect(capabilities.deposit.status).toBe('experimental');
    expect(isActionSupported(capabilities, 'deposit')).toBe(true);
  });

  it('marks an explicitly experimental configured vault as usable', () => {
    const capabilities = evaluateVaultCapabilities({
      ...READY,
      isExperimentalEnabled: true,
    });

    expect(capabilities.unlock.status).toBe('experimental');
    expect(isActionSupported(capabilities, 'unlock')).toBe(true);
  });

  it('returns available when all production readiness checks pass', () => {
    const capabilities = evaluateVaultCapabilities(READY);

    expect(capabilities.deposit.status).toBe('available');
    expect(capabilities.withdraw.status).toBe('available');
    expect(capabilities.lock.status).toBe('available');
    expect(capabilities.unlock.status).toBe('available');
    expect(isActionSupported(capabilities, 'unlock')).toBe(true);
    expect(getActionUnsupportedReason(capabilities, 'unlock')).toBeNull();
  });
});
