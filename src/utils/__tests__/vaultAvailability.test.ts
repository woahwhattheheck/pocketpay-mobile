import {
  evaluateVaultAvailability,
  evaluateVaultReadiness,
  describeUnavailableReason,
  describeVaultReadiness,
  isVaultFeatureEnabled,
  VaultAvailabilityInput,
  VaultReadinessState,
} from '../vaultAvailability';
import { evaluateVaultCapabilities, isActionSupported } from '../vaultCapabilities';

const configured: VaultAvailabilityInput = { publicKey: 'GPUBLIC123', isVaultConfigured: true };

describe('vault readiness', () => {
  const cases: [string, Partial<VaultAvailabilityInput>, VaultReadinessState, string[]][] = [
    ['configured', {}, 'ready', []],
    ['no contract', { isVaultConfigured: false }, 'planned', ['contract-not-configured']],
    ['no wallet', { publicKey: null }, 'unavailable', ['no-wallet']],
    ['backend unavailable', { isSdkReady: false }, 'unavailable', ['sdk-not-ready']],
    ['disabled', { vaultEnabledFlag: 'false' }, 'disabled', ['feature-disabled']],
    ['disabled and unconfigured', { vaultEnabledFlag: '0', isVaultConfigured: false }, 'disabled', ['feature-disabled', 'contract-not-configured']],
    ['wallet missing and unconfigured', { publicKey: null, isVaultConfigured: false }, 'unavailable', ['no-wallet', 'contract-not-configured']],
    ['all gates blocked', { publicKey: null, isVaultConfigured: false, vaultEnabledFlag: 'false', isSdkReady: false }, 'disabled', ['feature-disabled', 'no-wallet', 'sdk-not-ready', 'contract-not-configured']],
  ];

  it.each(cases)('%s', (_name, overrides, state, reasons) => {
    const input = { ...configured, ...overrides };
    const result = evaluateVaultAvailability(input);
    expect(result).toEqual({ state, reasons, isAvailable: state === 'ready', isContractConfigured: input.isVaultConfigured });
    const capabilities = evaluateVaultCapabilities({
      hasWallet: Boolean(input.publicKey),
      isContractConfigured: input.isVaultConfigured,
      isFeatureEnabled: isVaultFeatureEnabled(input.vaultEnabledFlag),
      isSdkReady: input.isSdkReady ?? true,
      isLoading: false,
    });
    for (const action of ['deposit', 'withdraw', 'lock', 'unlock'] as const) {
      expect(isActionSupported(capabilities, action)).toBe(result.isAvailable);
    }
  });

  it('uses identical normalized feature flag semantics', () => {
    for (const flag of ['false', ' FALSE ', '0', ' 0 ']) expect(isVaultFeatureEnabled(flag)).toBe(false);
    for (const flag of [undefined, '', 'true', '1']) expect(isVaultFeatureEnabled(flag)).toBe(true);
  });

  it('supports configuration transitions without retaining a previous ready state', () => {
    const sequence = [
      { ...configured, isVaultConfigured: false }, configured,
      { ...configured, vaultEnabledFlag: 'false' },
      { ...configured, publicKey: null }, configured,
    ];
    expect(sequence.map((input) => evaluateVaultAvailability(input).state))
      .toEqual(['planned', 'ready', 'disabled', 'unavailable', 'ready']);
  });

  it('keeps loading actions unavailable and gives configuration blockers priority', () => {
    const input = { hasWallet: true, isContractConfigured: true, isFeatureEnabled: true, isSdkReady: true, isLoading: true };
    expect(evaluateVaultCapabilities(input).deposit.status).toBe('loading');
    expect(evaluateVaultCapabilities({ ...input, isContractConfigured: false }).unlock.status).toBe('unsupported');
    expect(evaluateVaultCapabilities({ ...input, isFeatureEnabled: false }).lock.status).toBe('unsupported');
  });

  it('provides explicit, non-promissory state and reason copy', () => {
    for (const state of ['unavailable', 'planned', 'disabled', 'ready'] as const) {
      const copy = describeVaultReadiness(state);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
    }
    for (const reason of ['no-wallet', 'feature-disabled', 'sdk-not-ready', 'contract-not-configured'] as const) {
      expect(describeUnavailableReason(reason).message.length).toBeGreaterThan(0);
    }
    expect(describeVaultReadiness('ready').message).toContain('does not verify');
    expect(evaluateVaultReadiness({ hasWallet: true, isContractConfigured: false, isFeatureEnabled: true }).isAvailable).toBe(false);
  });
});
