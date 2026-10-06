# QR Receive Payload Format

This document explains the format the **Receive** screen encodes into its QR
code, and what any client (PocketPay's own SDK, or another Stellar wallet)
needs to know to parse it. It supersedes an earlier "format research" draft
that never reached a decision.

## Two formats, chosen automatically

The Receive screen (`app/receive.tsx`) builds its payload through
[`createReceivePayload`](../src/features/receive/qrPayload.ts). Which format
comes out depends on whether the user filled in the optional "Request a
specific amount" fields:

### 1. Address-only (default)

**Format:** the bare Stellar public key, unchanged.

```
GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV
```

Used whenever no amount, memo, or asset is requested. This is deliberately
**not** wrapped in a URI: any Stellar wallet, including ones with no
PocketPay-specific or SEP-0007 support, can scan a bare address and use it
as a payment destination. Wrapping the common "just pay me" case in a URI
scheme other wallets might not recognise would be a compatibility
regression for no benefit.

### 2. Payment request

**Format:** a `web+stellar:pay` URI modelled on
[SEP-0007](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md),
the Stellar ecosystem's URI scheme for delegated signing / payment
requests.

```
web+stellar:pay?destination=G...&network_passphrase=Test+SDF+Network+%3B+September+2015&amount=10.5&memo=Invoice+42&memo_type=MEMO_TEXT
```

Used as soon as the user fills in an amount, a memo, or both. There's no
way to encode "please pay exactly 10.5 XLM with this memo" into a bare
address, so this is the minimum needed once any of those fields matter to
the requester.

| Parameter | When present | Notes |
| --- | --- | --- |
| `destination` | Always | The requester's public key. |
| `network_passphrase` | Every validated mobile payment request | `Test SDF Network ; September 2015`, URL-encoded. SEP-0007 defaults to the public network when this is omitted. |
| `amount` | User entered an amount | Plain decimal string, validated with `validateAmount` (no balance check — the requester isn't the one spending). |
| `asset_code` / `asset_issuer` | Both provided together, or neither | A code with no issuer is ambiguous, so it's dropped rather than emitted alone. The app is currently XLM-only end to end (see `app/send.tsx`), so the builder accepts these for forward-compatibility but the Receive screen's UI doesn't expose an asset picker yet. |
| `memo` | User entered a memo | Validated with `validateMemo` (28-byte UTF-8 limit, per Stellar's text memo limit). |
| `memo_type` | Whenever `memo` is present | One of `MEMO_TEXT`, `MEMO_ID`, `MEMO_HASH`, `MEMO_RETURN` (SEP-0007's documented values — note this is a different casing than `@stellar/stellar-sdk`'s own internal `Memo` type strings, which are lowercase `"text"`/`"id"`/etc., since that's the XDR wire format rather than a URI parameter). Defaults to `MEMO_TEXT` when omitted. |

Query values are encoded with the platform's `URLSearchParams`
(`application/x-www-form-urlencoded`), matching how SEP-0007 URIs are
specified.

## Validation before display

The Receive screen never renders a QR directly from unchecked form values.
It calls `createReceivePayload`, which validates the complete request and
returns either a payload or field-specific errors.

- **Destination:** must be a valid Stellar public key. Missing or malformed
  wallet addresses suppress the QR instead of producing an unusable code.
- **Network:** the current mobile receive flow is Testnet-only. A Mainnet or
  custom network configuration suppresses QR generation and shows the network
  error rather than presenting a request that the app cannot safely honor.
  Validated payment-request URIs explicitly include the Testnet passphrase;
  checking the local network setting alone does not communicate it to another
  wallet. The bare-address format remains unchanged and carries no network
  information, so its sender must select Testnet separately.
- **Amount:** optional, but when present it must pass the shared positive-decimal
  validation used by payment flows.
- **Memo:** optional. The validated mobile receive flow currently supports
  `MEMO_TEXT` only and enforces Stellar's 28-byte UTF-8 text-memo limit.
  `MEMO_ID`, `MEMO_HASH`, and `MEMO_RETURN` remain representable by the
  low-level formatter for forward compatibility, but validated mobile requests
  reject them rather than applying text-memo rules to a different memo type. A
  memo type without a memo is also rejected.
- **Issued assets:** the low-level formatter can still represent
  `asset_code`/`asset_issuer` together for forward compatibility, but the
  current mobile screen is XLM-only. The validated mobile path therefore rejects
  issued-asset fields instead of silently dropping or advertising unsupported
  behavior.

The low-level `buildReceivePayload(params, networkPassphrase?)` formatter accepts
an explicit passphrase for non-public payment requests. Its omitted-passphrase
behavior remains the SEP-0007 public-network default. Mobile callers should use
`createReceivePayload` so validation and the Testnet parameter stay together.

When validation fails, the QR is replaced by a visible error state and Share is
disabled. Invalid optional fields are not removed from the request to make a
different payload appear valid.

## Parsing on the scan side

`app/scan.tsx` currently forwards whatever a scanned QR contains straight
to the Send screen as a plain destination string — it doesn't parse the
`web+stellar:pay` format yet. A payload built by this feature will scan
successfully as an address-only destination in this app's own Send flow
only when it's the bare-address form; a payment-request URI needs its own
parser to pre-fill amount/memo, which is out of scope for this change (see
`pocketpay-sdk` for where a shared parser should eventually live, so both
mobile and any other PocketPay client stay in sync — no such parser exists
there yet as of this writing).

## Copy and share fallback

- **Copy Address** always copies the bare public key, regardless of
  whether a payment request is active — the one guaranteed fallback for a
  sender who can't scan a QR code.
- **Share** shares whatever the current payload is: the bare address in
  address-only mode, or the full payment-request URI once an amount/memo
  is set, so sharing actually conveys the requested amount instead of
  silently dropping it.

## Fixtures

See [`__tests__/qrPayload.test.ts`](../__tests__/qrPayload.test.ts) for the
authoritative set of input → output examples, including whitespace
handling, special-character encoding in memos, and the asset-code-without-issuer
edge case.
