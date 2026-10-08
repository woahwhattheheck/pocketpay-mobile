# Development Diagnostics Export

Debugging mobile applications often requires insight into the app's internal state. However, ensuring that sensitive user data is protected is paramount.

The Development Diagnostics feature allows contributors to easily view, export, and share non-sensitive app state when debugging issues or reporting bugs.

## How It Works

In **development builds only**, open **Settings → Developer → App Diagnostics**. The screen displays a non-sensitive status snapshot collected by `getDiagnostics()` and redacted again before rendering. Select **Export Diagnostics Log** to share exactly that JSON snapshot through the native OS share sheet. No report is uploaded automatically. In production builds, the Settings entry is hidden and the `/diagnostics` route redirects to the main tabs.

**Refresh and recovery:** Select **Refresh Diagnostics** to collect an updated snapshot. While collection is in progress, the previous safe snapshot remains visible and refresh/export actions are disabled. On a refresh failure, the prior redacted snapshot is retained alongside an error without raw provider details. If the initial collection fails, select **Retry diagnostics** to try again. Sharing is disabled during an active export so duplicate share sheets cannot be opened.

## Redacted Information

The diagnostics payload is explicitly designed to **exclude** any sensitive data that could compromise a user's wallet or privacy. 

The following information is **REDACTED**:
- Secret Keys
- Public Keys
- Exact contact details (names, public keys)
- Full transaction history and amounts
- Full Horizon / Soroban RPC URLs (only the hostname is included)
- The vault contract ID (shown masked, e.g. `CABCDE…UVWXYZ`, or omitted entirely in mock mode)
- Wallet balance

## Included Information

The exported JSON string includes useful metadata for debugging:
- **Environment**: OS platform and version, app version, and development-build status
- **Network**: Network tier (`mainnet` / `testnet` / `custom`) and label, Horizon and Soroban RPC **hostnames only** (never the full URL), and vault mode (`configured` with a masked contract ID, or `mock`). Reuses the exact same classification the Settings screen shows (`src/features/settings/useNetworkEnvironment`), so this can never drift from what the user sees on-device.
- **Feature Flags**: every flag defined in `src/config/featureFlags.ts`, by name, with its enabled/disabled state — no description text, just enough to tell support which build variant a user is on.
- **Storage**: whether secure device storage (Keychain on iOS, Keystore on Android) is available via `SecureStore.isAvailableAsync()` — a capability check, not a read of anything actually stored.
- **App State**: Initialization status, UI Theme, total count of saved contacts
- **Wallet State**: whether a public key is configured, whether balance data was loaded (never the balance), coarse balance/funding state, transaction count, loading state, last refresh time, and a fixed privacy placeholder if a wallet-store error exists
- **Network Health**: coarse error category (`timeout`, `rate_limit`, `authorization`, `connection`, `other`) and an error-presence flag, never the original message
- **Last Reported Failure**: only allowlisted source and exception-type labels (unknown labels become `Other`/`Error`), a fixed `Details omitted for privacy` message, fatal flag, and timestamp

The current diagnostics screen does **not** expose a synthetic-error trigger. It can show categories for a previously captured failure without exporting its original message. For ErrorBoundary recovery guidance, see [Error Handling](./error-handling.md).

## Safe Sharing

The **Export Diagnostics Log** button opens the native system share sheet
(`Share.share`) with the redacted JSON as the message body — the same flow
as sharing any other text on the device (Messages, Mail, copy to clipboard
via the share sheet's own copy action, pasting into a GitHub issue, etc.).
Nothing is uploaded automatically; the user chooses the destination each
time, the same as they would for any other shared text.

Before sharing a diagnostics export publicly (a GitHub issue, a public
support forum), a reporter should still eyeball the payload once: this
the builder structurally omits keys, balances, full transaction details,
full URLs and raw error messages; the UI also applies
[`redactSensitiveValue`](../src/utils/redactSensitive.ts) before display or
sharing. This is stronger than relying solely on recognisable key patterns,
but reviewers should still inspect any report before sending it to a third party.

### Example Payload

```json
{
  "environment": {
    "platform": "ios",
    "osVersion": "16.4",
    "appVersion": "1.0.0",
    "isDevelopment": true
  },
  "network": {
    "tier": "testnet",
    "label": "Testnet",
    "horizonHost": "horizon-testnet.stellar.org",
    "sorobanHost": "soroban-testnet.stellar.org",
    "vaultMode": "mock",
    "vaultContractLabel": "Mock (no contract)"
  },
  "featureFlags": {
    "ENABLE_VAULT_EXPERIMENTAL": true,
    "SHOW_DEBUG_PANEL": false,
    "ENABLE_NEW_SEND_FLOW": false
  },
  "storage": {
    "secureStoreAvailable": true
  },
  "appState": {
    "isInitialized": true,
    "themeMode": "system",
    "contactsCount": 2
  },
  "walletState": {
    "hasPublicKey": true,
    "isBalanceLoaded": true,
    "balanceState": "loaded",
    "fundingStatus": "funded",
    "transactionsCount": 5,
    "isLoading": false,
    "lastRefreshed": null,
    "lastError": null
  },
  "networkHealth": {
    "classifiedError": "other",
    "hasError": false
  },
  "lastReportedError": {
    "source": "ErrorBoundary",
    "name": "Error",
    "message": "Details omitted for privacy",
    "isFatal": false,
    "timestamp": "2026-07-27T17:00:00.000Z"
  },
  "timestamp": "2026-07-27T17:00:00.000Z"
}
```

For the full app-wide error recovery model, see [Global Error Handling](./error-handling.md).