# Mobile SDK Error Mapping

PocketPay uses `src/utils/sdkErrorMapper.ts` as the shared boundary between raw SDK/provider failures and user-facing recovery guidance.

## Domains

Every mapping is tagged with one of four domains:

- `payment` — payment and Horizon submission failures;
- `wallet` — secure wallet storage and key-access failures;
- `transaction` — transaction lifecycle/status failures;
- `vault` — vault, Soroban, and contract-action failures.

The mapper returns a stable category, severity, title, message, recovery copy, recovery action, retry/navigation hints, and a non-sensitive diagnostic code such as `SDK-PAYMENT-INSUFFICIENT_BALANCE`.

## Recovery actions

The normalized recovery action is one of:

- `retry`
- `edit-input`
- `fund-wallet`
- `check-history`
- `refresh`
- `reimport-wallet`
- `open-settings`
- `contact-support`
- `none`

An unknown transaction status is intentionally non-retryable and directs the user to transaction history. This avoids suggesting a duplicate payment when the app cannot prove whether a signed submission reached the network.

## Sensitive-data boundary

Raw SDK/provider error text is used only in-memory for classification. It is not returned from `mapSdkError()`.

Unknown errors therefore use fixed fallback copy rather than echoing arbitrary exception strings. The returned diagnostic code is derived only from domain and category; it contains no wallet address, secret key, endpoint URL, contract identifier, amount, memo, or provider payload.

Known classifiers also pass raw text through `redactSensitiveString()` before matching as defense in depth.

## Compatibility

Existing feature APIs remain available:

- `classifyPaymentError()` delegates to the shared mapper;
- `classifyVaultError()` and `describeVaultError()` delegate to the shared mapper;
- `classifyWalletStorageError()` exposes the wallet domain.

This lets existing payment/vault callers adopt the shared taxonomy without a broad UI rewrite. Vault action/deposit progress paths also use the shared mapper so arbitrary thrown messages are not shown directly.

## Adding a new SDK error

1. Add or reuse a canonical category in `SdkErrorCategory`.
2. Add user-safe guidance to the shared template table.
3. Add the narrowest matching rule needed for the provider code.
4. Add one focused regression covering category, recovery action, and diagnostic code.
5. If the provider payload may contain user data, keep that payload out of the returned mapping and diagnostics.
