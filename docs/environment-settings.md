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

The environment classifier deliberately fails closed when runtime configuration is malformed.
It extracts hostnames **only** from parsable HTTP(S) URLs; invalid, unsupported, or
opaque endpoint values display `—` rather than a regex fallback that could leak
a username, password, path or token. Valid URLs containing credentials still
display only the hostname. A full 56-character canonical Stellar contract ID
is shortened to its first six and last six characters; short/noncanonical
contract IDs are shown as `Unverified contract ID` with a configuration warning,
not echoed verbatim. Unknown custom network names are classified and labeled
`Custom Network` rather than exposing arbitrary build-time strings that may
contain secret-shaped values. Normal Testnet and Mainnet labels remain clear.

These boundaries apply to both on-screen Settings and structured diagnostics
because both consume the same classifier. Five focused regression cases were
added in `__tests__/settings.networkDisplaySafety.test.ts` to cover malformed
URL secrets, valid URL credentials, contract masking, custom network masking
and standard network behavior; cases were authored, not executed in this
source delivery.

Diagnostics exports have their own additional redaction boundary documented
in [Development Diagnostics Export](./diagnostics.md).

## Why this shares the diagnostics classifier

Settings and diagnostics both consume `computeNetworkEnvironment()` rather than independently parsing environment variables. This prevents the UI and exported diagnostics from disagreeing about network tier, endpoint hostnames, or vault capability.
