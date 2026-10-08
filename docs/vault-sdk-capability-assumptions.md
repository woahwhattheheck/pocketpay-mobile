# Vault SDK Capability Assumptions

This document describes the assumptions the mobile client makes about the PocketPay SDK and Soroban contract readiness, and how vault capabilities are gated.

## Current Capability Checks

The live `useVaultCapabilities()` hook derives readiness from wallet state and vault store reads; it does not call a hypothetical SDK readiness API yet.

| Signal | Source | Effective behavior |
|---|---|---|
| Wallet present | `walletStore.publicKey` | No wallet gives `unavailable` |
| Feature gate | `EXPO_PUBLIC_VAULT_ENABLED` | Defaults to `true`; `false` or `0` blocks actions |
| SDK ready flag | `EXPO_PUBLIC_VAULT_SDK_READY` | Defaults to `true`; `false` or `0` blocks actions; this is configuration, **not a live readiness probe** |
| Contract configured | `vaultStore.isConfigured` | Missing contract selects a **usable local experimental preview**, not live funds movement |
| Loading | `vaultStore.isLoadingBalance / isLoadingLocks` | `loading` disables actions |
| Error | `vaultStore.balanceError` | `error` disables actions and provides an explanation |
| Explicit experimental flag | `FEATURE_FLAGS.ENABLE_VAULT_EXPERIMENTAL` | Configured actions are labeled experimental when enabled and marked experimental |

## Capability Gate Architecture (Issue #391)

The `src/utils/vaultCapabilities.ts` evaluator returns one of **five** per-action states for deposit, withdraw, lock and unlock:

- `available` — all readiness signals pass for a configured vault, and experimental mode is not selected
- `experimental` — usable, visibly labeled preview/Testnet path; **no contract** means local mock behavior and no real fund movement
- `unavailable` — feature/SDK disabled or wallet missing; includes user-facing `reason` and `detail`
- `loading` — an in-flight capability check; not actionable
- `error` — vault balance/capability read failed; includes `reason` and `detail`

`isActionSupported` returns `true` **only** for `available` and `experimental`. Actions must be guarded at the call site as well as visually disabled: an already-open preview/confirmation can outlive the original capability state. On the vault tab, deposit, withdraw, lock and unlock handlers recheck capability and network readiness immediately before invoking an action; deposit preview confirmation forwards the explicitly chosen `deposit` action without assuming React state updates synchronously. The underlying vault module should also enforce authorization and signing separately; UI capability flags are not a security boundary.

### VaultCapabilityInput

```typescript
interface VaultCapabilityInput {
  hasWallet: boolean;
  isContractConfigured: boolean;
  isFeatureEnabled: boolean;
  isSdkReady: boolean;
  isLoading: boolean;
  isExperimentalEnabled?: boolean;
  error?: string | null;
}
```

### Focused manual acceptance scenarios

1. Disable `EXPO_PUBLIC_VAULT_ENABLED` or the SDK readiness flag: all four action controls become unavailable and direct confirmation attempts are ignored.
2. Start a deposit preview, then lose wallet/network/readiness before confirming: confirmation must not submit; an unchanged preview with readiness restored can be reconsidered.
3. With preview mode enabled and no contract, actions explicitly say experimental and cannot be mistaken for live fund movements.
4. After loading or a balance-read error, the controls remain disabled until the state genuinely clears.

## Future SDK Capability Signal

When the PocketPay SDK (`pocketpay-sdk`) ships a vault readiness API, the mobile client should:

1. Call `sdk.vault.isReady()` (or equivalent) during app initialization.
2. Store the result in a dedicated capability store or context.
3. Pass it to `evaluateVaultCapabilities()` as the `isSdkReady` input.
4. Add finer-grained checks per action when `sdk.vault.getCapabilities()` is available.

### Expected SDK Interface

```typescript
interface PocketPaySDK {
  vault: {
    /** Returns true when the vault contract is deployed and reachable. */
    isReady(): Promise<boolean>;
    /** Returns the set of vault features currently available. */
    getCapabilities(): Promise<VaultCapabilities>;
  };
}

interface VaultCapabilities {
  deposit: boolean;
  withdraw: boolean;
  lock: boolean;
  unlock: boolean;
}
```

Until this interface is available, the mobile client uses `isSdkReady: true` as the default.

## Related Documentation

- [Vault Integration Assumptions](./vault-integration-assumptions.md)
- [Vault Integration Risks](./vault-integration-risks.md)
- [Vault UI Guidance](./vault-ui-guidance.md)
- [Account Funding States](./account-funding-states.md)
