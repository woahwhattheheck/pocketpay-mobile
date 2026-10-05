# Environment and Feature Settings

The Settings tab exposes a small, non-sensitive summary of the runtime environment so testers and contributors can tell which network and experimental capabilities are active without inspecting build-time configuration.

## Always-visible environment state

The **Environment** section uses `useNetworkEnvironment()` / `computeNetworkEnvironment()` as its single source of truth. It displays:

- the classified Stellar network label (mainnet, testnet, or custom);
- the Horizon **hostname only**;
- vault capability as configured or mock mode;
- the vault contract as a masked label when configured;
- the environment warnings already produced by the shared classifier.

The footer uses the same dynamic network label instead of hard-coding Testnet.

## Development-only state

Development builds add a **Developer** section that shows:

- whether redacted diagnostics are available;
- each flag from `src/config/featureFlags.ts` and its enabled/disabled state;
- an **Experimental** marker on experimental flags;
- a warning when one or more experimental flags are enabled.

Feature flags and diagnostics controls are intentionally hidden from production settings. Environment/network warnings remain visible because they describe the network the app is actually using.

## Sensitive-data boundary

Settings never displays:

- wallet secret keys;
- network passphrases;
- full Horizon or Soroban URLs;
- a full vault contract ID;
- wallet balances or transaction payloads.

Endpoint visibility is limited to hostnames, and the vault contract label is masked by the shared environment classifier. Diagnostics exports have their own redaction boundary documented in [Development Diagnostics Export](./diagnostics.md).

## Why this shares the diagnostics classifier

Settings and diagnostics both consume `computeNetworkEnvironment()` rather than independently parsing environment variables. This prevents the UI and exported diagnostics from disagreeing about network tier, endpoint hostnames, or vault capability.
