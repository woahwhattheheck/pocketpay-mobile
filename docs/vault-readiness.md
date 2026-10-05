# Mobile vault readiness

The vault screen and all four action capability gates share the model in
`src/utils/vaultAvailability.ts`. The model is about prerequisites for interaction,
not proof that the deployed contract supports every feature.

| State | Condition, in precedence order | User experience |
| --- | --- | --- |
| `disabled` | `EXPO_PUBLIC_VAULT_ENABLED` is `false` or `0` (case/whitespace normalized) | "Vault Disabled"; actions blocked; no configuration-changing retry button |
| `unavailable` | Wallet missing or an explicit SDK readiness signal is false | "Vault Unavailable" with every missing prerequisite; Settings for a missing wallet |
| `planned` | Wallet available and feature enabled, but no vault contract configured | "Vault Planned"; placeholder only; deposit, withdraw, lock and unlock blocked |
| `ready` | All the above gates satisfied | Configuration permits interaction; loading, network and per-operation checks still apply |

All blocking reasons are retained even when one state takes precedence. State is
recomputed from the current inputs, including when configuration is removed or a
wallet disconnects. Configured/loading actions report `loading`; a missing contract
or disabled feature remains `unsupported` even if data loading has not finished.

## Current limitations

- "Ready" is configuration readiness, not a claim that a contract is deployed,
  reachable, audited or capable of a successful transaction. The UI calls it
  "Vault Configured".
- The SDK has no runtime vault-readiness API yet. The hooks retain the existing
  documented `isSdkReady: true` compatibility default. An explicit false value is
  supported by the shared evaluator for a future real readiness signal; no probe
  or backend integration is implemented by this change.
- Time locks still use the existing local/mock implementation. Configuration
  does not turn them into on-chain time locks. Placeholder balances must not be
  interpreted as deposited funds.
- Removing mock-mode access from the user-facing action gates does not replace
  service adapters or storage. Code that invokes those services outside the vault
  UI must enforce its own prerequisites.
- Environment configuration changes require rebuilding the Expo app. Reloading
  vault data cannot enable a disabled build or configure a contract.

## Focused regression coverage

`src/utils/__tests__/vaultAvailability.test.ts` covers all four states, combined
blockers, normalized flags, state transitions and agreement with all four action
gates. `__tests__/VaultUnavailableState.test.tsx` covers the three non-ready
presentations, settings/retry behavior and rerendering when prerequisites change.
The readiness cases in `__tests__/vault.test.tsx` cover screen integration,
placeholder balances and dismissal of stale previews.

```sh
npm test -- --runInBand --runTestsByPath src/utils/__tests__/vaultAvailability.test.ts __tests__/VaultUnavailableState.test.tsx __tests__/vault.test.tsx
```

See also [SDK capability assumptions](vault-sdk-capability-assumptions.md).
