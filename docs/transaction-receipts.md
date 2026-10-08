# Transaction receipts: five honest outcome states (#522)

The wallet's receipt route is `/payment-receipt`. The source view-model is `src/features/transactions/receipt.ts`; it extends the existing payment-success formatting helper without duplicating it.

| Outcome | When to use it | What the screen promises |
| --- | --- | --- |
| `success` | A confirmed network result | Network confirmation received |
| `pending` | Submitted but no final result yet | Not final; check before resubmitting |
| `failed` | Verified failed attempt | This attempt did not complete successfully |
| `rejected` | Explicit rejection or user cancellation before completion | No successful completion is implied |
| `unknown` | Timeout, ambiguous error, unrecognized/missing status | Do not resubmit until outcome is checked |

Receipt fields: status, amount, recipient, asset, timestamp, transaction hash, and explorer link when an available network is configured. Missing or malformed public fields render a placeholder; a malformed hash cannot generate an explorer link. Raw signer payloads, wallet keys, XDR, and transport errors are not included.

The review flow navigates here after confirmed completion and offers a receipt after failed/ambiguous outcomes. In the ambiguous case, `unknown` is deliberate: a client timeout can occur after network acceptance. No second submission occurs in the receipt screen; only wallet/activity navigation and public explorer navigation are offered.

The route accepts `status`, `hash`, `amount`, `recipient`, `asset`, `timestamp`; compatibility aliases `destination` and `date` are accepted. The earlier `/payment-success` route remains intact for compatibility with existing deep links, but new review outcomes use the typed receipt route.

Focused regression source: `src/features/transactions/__tests__/receiptOutcome.test.ts` (five statuses, ambiguous default, public field sanitization, explorer/no-explorer). Run only this test when needed:

```bash
npm test -- --runInBand src/features/transactions/__tests__/receiptOutcome.test.ts
```

The UI shows a client-provided route status; it does not independently re-query network finality. A fresh network explorer check is necessary for unconfirmed transactions. No physical-device test or payment award is asserted.
