# Phase F — Controlled Accounting Bridge Posting

This document records the controlled accounting bridge posting contract for SUBIDHA CORE.

## Phase F baseline — Payment bridge posting

The first controlled slice supports concrete `Payment` source items for `subscription_emi_payment`.

Rules:

- preview is read-only
- posting is explicit and admin-only
- posting is idempotent by source/event/idempotency key
- posting creates `JournalEntry`, `AccountingBridgePosting`, and a pending `ReconciliationItem`
- posted/unverified rows are not marked reconciled automatically
- abstract readiness rows are never postable
- Staff Advance remains unsupported

## Phase F2 — ReceiptDocument bridge posting

Phase F2 extends the same controlled bridge workflow to concrete `ReceiptDocument` source items only.

Supported source model:

```text
ReceiptDocument
```

Supported event keys:

```text
direct_sale_receipt
customer_advance
customer_refund
refund_customer_credit
```

Current safe classification:

- `direct_sale_receipt` is used for retail receipt documents tied to direct-sale source posture.
- `customer_advance` is used for manual/unapplied retail receipt documents that are not tied to a direct sale, invoice, or Payment.
- `refund_customer_credit` is reserved for note-adjustment style receipt documents where the current data shape supports it.
- EMI payment receipts are skipped because the concrete `Payment` candidate remains the authoritative EMI posting source.
- Cancelled or voided receipts are skipped. Void/reversal posting is not included in Phase F2.
- Unsupported receipt shapes remain non-postable.

## Preview contract

Preview endpoint:

```http
GET /api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/
```

Preview must remain read-only. It must not create:

- `JournalEntry`
- `AccountingBridgePosting`
- `ReconciliationItem`
- document numbers
- source ReceiptDocument mutations

Preview returns the concrete source identity, journal-date context, accounting period, journal-number preview, debit lines, credit lines, totals, blockers, warnings, idempotency key, and safety copy.

## Posting contract

Post endpoint:

```http
POST /api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/
```

Posting is:

- admin-only
- explicit confirmation only
- transactional
- idempotent per `ReceiptDocument` + event key + idempotency key
- tied to a concrete source record

Posting creates:

- one posted `JournalEntry`
- one `AccountingBridgePosting`
- one pending/unverified `ReconciliationItem`

Posting does not mutate original receipt financial fields. In particular, this bridge slice does not set `ReceiptDocument.posted_journal_entry` and does not change receipt amount, receipt number, status, source reference, finance account, Payment, EMI, Subscription, DirectSale, BillingInvoice, stock, commission, payout, delivery, or rent/lease source data.

## Reconciliation contract

After posting, the row remains pending/unverified until explicit reconciliation verification.

Verification endpoint:

```http
POST /api/v1/admin/accounting/bridge-reconciliation/items/{id}/verify/
```

Verification is admin-only and applies only to clean `POSTED_UNVERIFIED` bridge reconciliation items. It does not mutate the source `ReceiptDocument`.

## Period close impact

ReceiptDocument bridge rows follow the same close posture as Payment bridge rows:

- ready/unposted ReceiptDocument rows block close as unposted bridge work
- posted/unverified ReceiptDocument rows block close as unreconciled work
- verified/reconciled ReceiptDocument rows no longer block close as unreconciled
- unsupported receipt shapes remain visible and non-postable

## Safety limits

Phase F2 does not add bridge posting for:

- BillingInvoice
- DirectSale source records
- Rent/Lease source records
- PurchaseBill
- StockLedger
- Commission or payout
- salary or payroll
- StaffAdvance

Do not auto-post, auto-reconcile, auto-close periods, create fake mappings, or fake Staff Advance readiness.
