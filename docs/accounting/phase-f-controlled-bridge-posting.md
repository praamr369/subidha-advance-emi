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

## Phase F3 — BillingInvoice bridge posting

Phase F3 extends the controlled bridge workflow to concrete `BillingInvoice` source items only.

Supported source model:

```text
BillingInvoice
```

Supported event keys:

```text
direct_sale_invoice
direct_sale_outstanding
```

Current safe classification:

- `direct_sale_invoice` is used only when the concrete source record is `BillingInvoice` and its source posture is direct sale.
- `direct_sale_outstanding` is allowed only when the concrete source record is `BillingInvoice` and the invoice has an outstanding receivable posture.
- Draft, cancelled, and voided invoices are skipped as not applicable.
- Proforma, demand note, subscription, rent/lease, and deposit/liability shapes are unsupported until a later phase defines their accounting treatment.
- BillingInvoice posting resolves receivable, sales revenue, and output GST accounts from active posting profiles/canonical chart accounts. Missing receivable, revenue, tax, period, or journal numbering setup blocks posting with an exact reason.

Invoice preview remains read-only. It does not create journals, bridge postings, reconciliation items, numbering consumption, source mutations, invoice status changes, tax recalculation, receipt allocation changes, or DirectSale mutations. The preview includes invoice identity, invoice number/reference, invoice date, invoice type/status, event key, amount, taxable amount, tax amount, journal date, accounting period, journal number preview, debit lines, credit lines, tax lines, balance status, blockers, warnings, idempotency key, and safety text.

Invoice posting is explicit, admin-only, transactional, idempotent, and tied to:

```text
source_model = BillingInvoice
source_pk = invoice.id
event_key = direct_sale_invoice or direct_sale_outstanding
```

Posting creates a posted `JournalEntry`, an `AccountingBridgePosting`, and a pending/unverified `ReconciliationItem`. It does not mutate `BillingInvoice` financial fields, `BillingInvoice.status`, `BillingInvoice.posted_journal_entry`, DirectSale, ReceiptDocument, Payment, EMI, Subscription, StockLedger, PurchaseBill, Commission, Payout, Delivery, or rent/lease source records.

Reconciliation remains pending until a run and/or explicit verification confirms the bridge item. Ready/unposted invoice rows block close as unposted bridge work. Posted/unverified invoice rows block close as unreconciled bridge work. Verified/reconciled invoice rows do not block close as unreconciled work. Unsupported invoice types remain visible separately and are never fake-posted.

## Safety limits

Phase F3 does not add bridge posting for:

- DirectSale source records
- Rent/Lease source records
- PurchaseBill
- StockLedger
- Commission or payout
- salary or payroll
- StaffAdvance

Do not auto-post, auto-reconcile, auto-close periods, create fake mappings, or fake Staff Advance readiness.
