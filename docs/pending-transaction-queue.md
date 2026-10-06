# Pending Transaction Queue

This document describes the mobile pending transaction queue feature, which provides visibility into optimistic pending transactions on the History screen.

## Overview

When a user submits a payment, the app optimistically inserts a pending transaction record into the wallet store before Horizon confirms it. The pending transaction queue UI surfaces these entries in a dedicated section at the top of the History screen, giving users clear feedback that their transaction has been submitted and is awaiting network confirmation.

---

## Architecture

### Data source

Submitted transactions awaiting reconciliation are stored in `useWalletStore.pendingTransactions`, a `Record<string, TransactionRecord>` keyed by deterministic transaction hash. Entries are added by `addPendingTransaction()` and reconciled (removed) in `refreshWalletData()` once the real Horizon record appears.

```
Pending map: { [hash]: TransactionRecord & { status: 'pending' | 'unknown' } }
```

`pending` means Horizon acknowledged submission and the app is waiting for history reconciliation. `unknown` means the transaction was signed and handed to the submission call, but the app did not receive an authoritative Horizon response. An unknown state is **not** proof of failure and must not trigger a blind resend.

### Restart persistence

Pending and unknown recovery metadata is persisted in local storage under a key scoped to the wallet public key. After wallet initialization derives the active public key, the store restores only the records belonging to that wallet. Writes are serialized so rapid status changes cannot race older snapshots back into storage.

The persisted recovery record contains public transaction metadata only. Secret-key material is never written to this storage path. Clearing the active wallet also clears that wallet's persisted pending/unknown records.

### Reconciliation

During `refreshWalletData()`, each pending or unknown hash is checked against the Horizon response's `transaction_hash` field. If a match is found, the optimistic entry is dropped from the in-memory map and its persisted recovery record is removed to avoid duplicate display after a later restart. Entries that don't reconcile remain visible — there is no forced expiry or automatic resend.

### Components

| Component | File | Role |
|---|---|---|
| `PendingTransactionItem` | `src/components/PendingTransactionItem.tsx` | Single pending transaction row |
| `PendingTransactionQueue` | `src/components/PendingTransactionQueue.tsx` | Section container with header, count badge, refresh, and empty state |

### History integration

The `PendingTransactionQueue` is rendered in the `ListHeaderComponent` of the History screen's `SectionList`, between the filter chips and the grouped transaction sections. It is always visible regardless of the active filter, ensuring users always see pending items.

---

## Acceptance Criteria

### PendingTransactionItem

| AC | Description |
|---|---|
| AC-PTI1 | Shows the correct direction label: "Sent XLM" or "Received XLM" based on `currentPublicKey` |
| AC-PTI2 | Displays the formatted amount with +/– prefix (e.g. `-10.0000000`, `+25.5000000`) |
| AC-PTI3 | Shows a `StatusBadge` with text "Pending" and tone "info" |
| AC-PTI4 | Shows relative time since submission (e.g. "2 min ago", "1 hr ago", "1d ago") |
| AC-PTI5 | Displays the transaction type tag: "Payment" for standard payments, "Vault" for `invoke_host_function` |
| AC-PTI6 | Does not crash with missing fields — gracefully handles undefined `amount`, `created_at`, etc. |

### PendingTransactionQueue

| AC | Description |
|---|---|
| AC-PTQ1 | Shows a `PendingTransactionItem` for each entry in `pendingTransactions` |
| AC-PTQ2 | Displays a count badge with the number of pending items in the section header |
| AC-PTQ3 | Shows a success-style empty state ("All caught up") when there are no pending transactions |
| AC-PTQ4 | Refresh button calls the `onRefresh` callback when tapped |
| AC-PTQ5 | Refresh button is disabled (non-responsive) while `isRefreshing` is true |
| AC-PTQ6 | Shows safe guidance text: "These transactions have been submitted and are waiting for network confirmation" |
| AC-PTQ7 | Does **not** offer retry/resend/try-again actions (unsafe retry messaging is avoided) |

---

## Design Decisions

### Unknown status recovery and no blind retry

The queue deliberately does not expose any retry or resend mechanism. This is an explicit design requirement — if acknowledgement is lost after a signed transaction reaches Horizon, submitting another payment can duplicate the user's intent.

When an entry is marked `unknown`, the row displays **Status unknown** and the queue tells the user to refresh/check History before sending again. Pull-to-refresh uses the deterministic transaction hash to reconcile against Horizon. A definitive Horizon rejection remains a separate failure and is not added to this queue.

Restart persistence exists to preserve this safety cue across app process death. Restoring an `unknown` record does not resubmit, poll in a new loop, or change signing behavior; it only restores the deterministic hash and user-visible reconciliation state for the matching wallet.

### Always-visible section

The pending queue section is shown regardless of the active filter tab (All, Sent, Received, etc.). This ensures users never miss visibility into pending transactions, even when browsing a specific transaction type.

### Relative time display

The `PendingTransactionItem` shows time since submission using `formatRelativeTime()`:
- `< 1 min` → "just now"
- `1–59 min` → "X min ago"
- `1–23 hr` → "X hr ago"
- `≥ 24 hr` → "Xd ago"

---

## History filter fix

The "Pending" filter in the History screen previously only checked `tx.is_pending === true` (the Horizon field). Optimistic entries use `status: 'pending'` instead. The filter was updated to check both:

```typescript
const isPending = tx.is_pending === true || tx.status === 'pending';
```

This ensures the "Pending" filter correctly shows both Horizon-confirmed pending operations and locally inserted optimistic entries.

---

## Testing

Tests are in `__tests__/PendingTransactionItem.test.tsx`, `__tests__/PendingTransactionQueue.test.tsx`, and `__tests__/walletStore.pendingTransactions.test.ts`.

Focused restart coverage verifies that pending/unknown metadata is restored for the matching wallet after initialization and removed after authoritative reconciliation.

To run the focused tests:

```bash
npx jest PendingTransactionItem
npx jest PendingTransactionQueue
npx jest walletStore.pendingTransactions
```

---

## Files

| File | Description |
|---|---|
| `src/components/PendingTransactionItem.tsx` | Single pending tx row component |
| `src/components/PendingTransactionQueue.tsx` | Queue section container |
| `app/(tabs)/history.tsx` | History screen (integration + filter fix) |
| `src/store/walletStore.ts` | Pending/unknown state, wallet-scoped persistence, restore, and reconciliation cleanup |
| `__tests__/PendingTransactionItem.test.tsx` | Item component tests (6 ACs) |
| `__tests__/PendingTransactionQueue.test.tsx` | Queue component tests (7 ACs) |
| `__tests__/walletStore.pendingTransactions.test.ts` | Persistence, restore, and reconciliation regressions |
| `docs/pending-transaction-queue.md` | This document |
