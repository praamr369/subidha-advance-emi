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

## Phase F4 — Credit Note / Sales Return bridge posting

Phase F4 extends the controlled bridge workflow to concrete credit-note and return source records only.

Supported source models:

```text
BillingCreditNote
DirectSaleReturn
```

Supported event keys:

```text
credit_note_issue
sales_return
customer_credit_adjustment
direct_sale_return
```

Current safe classification:

- `credit_note_issue` is used for approved concrete `BillingCreditNote` records without stock-return posture.
- `sales_return` is used for approved concrete `BillingCreditNote` records that represent stock-effect or direct-sale-return posture.
- `customer_credit_adjustment` is reserved for concrete credit-note shapes where the source clearly represents customer credit adjustment.
- `direct_sale_return` is used only when the concrete source record is `DirectSaleReturn`.
- Draft, cancelled, and voided credit notes are skipped as not applicable.
- Cancelled DirectSaleReturn rows are skipped. DirectSaleReturn rows that require approval remain blocked by approval and are not postable.
- Unsupported credit/return shapes remain visible and non-postable.

Accounting shape:

- Debit `SALES_RETURNS` for taxable sales-return / credit-note adjustment value.
- Debit `OUTPUT_GST` only when the concrete source has a tax reversal amount and the active chart/posting setup supports output-GST reversal.
- Credit `CUSTOMER_RECEIVABLE` for the full customer receivable reduction.

Tax reversal is not guessed. If `OUTPUT_GST` cannot be resolved for a taxable credit/return source, the candidate is blocked by mapping and cannot post.

## Phase F5 — BillingDebitNote bridge posting

Phase F5 extends the controlled bridge workflow to concrete debit-note source records only.

Supported source model:

```text
BillingDebitNote
```

Supported event keys:

```text
debit_note_issue
customer_debit_adjustment
damage_recovery
additional_receivable_adjustment
```

Current safe classification:

- `debit_note_issue` is the default event for approved concrete `BillingDebitNote` records.
- `damage_recovery` is used only when the concrete `BillingDebitNote` reason indicates damage/recovery posture.
- `customer_debit_adjustment` is used only when the concrete `BillingDebitNote` reason indicates adjustment posture.
- `additional_receivable_adjustment` is used only when the concrete `BillingDebitNote` reason indicates additional/extra receivable posture.
- Draft, cancelled, and voided debit notes are skipped as not applicable.
- Unsupported debit-note shapes remain visible and non-postable.

Accounting shape:

- Debit `CUSTOMER_RECEIVABLE` for the full debit-note receivable increase.
- Credit `DIRECT_SALE_INCOME` / `SALES_REVENUE` / mapped adjustment income for the taxable adjustment value.
- Credit `OUTPUT_GST` only when the concrete source has a tax amount and the active chart/posting setup supports output-GST posting.

Tax posting is not guessed. If `OUTPUT_GST` cannot be resolved for a taxable debit-note source, the candidate is blocked by mapping and cannot post.

## Phase F6 — PurchaseBill / Vendor Payable bridge posting

Phase F6 extends the controlled bridge workflow to concrete `PurchaseBill` source records only.

Supported source model:

```text
PurchaseBill
```

Supported event keys:

```text
purchase_bill_accrual
vendor_payable_invoice
input_tax_credit
purchase_expense_accrual
```

Current safe classification:

- `purchase_bill_accrual` is the default event for approved concrete `PurchaseBill` records.
- Draft and cancelled purchase bills are skipped as not applicable.
- Legacy `PurchaseBill.status=POSTED` rows that were processed by the old inventory stock service are not made bridge-postable unless an accounting bridge posting already exists, because the legacy path may have mutated stock/status/journal state.
- Unsupported purchase bill shapes remain visible and non-postable.

Accounting shape:

- Debit `PURCHASE_EXPENSE` / `PURCHASE_CLEARING` / `INVENTORY_CLEARING` for the taxable purchase value.
- Debit `INPUT_GST` only when the concrete source has tax and active setup supports input GST.
- Credit `VENDOR_PAYABLE` / `ACCOUNTS_PAYABLE` for the full payable amount.

Inventory boundary:

- F6 does not create or mutate `StockLedger`.
- F6 does not update `InventoryItem`, stock quantity, stock valuation, delivery demand, or COGS.
- F6 does not call the legacy `post_purchase_bill` inventory service.

Tax posting is not guessed. If `INPUT_GST` cannot be resolved for a taxable purchase bill, the candidate is blocked by mapping and cannot post.

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
- source Payment, ReceiptDocument, BillingInvoice, BillingCreditNote, BillingDebitNote, PurchaseBill, or DirectSaleReturn mutations
- StockLedger or inventory valuation mutations

Preview returns the concrete source identity, journal-date context, accounting period, journal-number preview, debit lines, credit lines, tax lines where supported, totals, blockers, warnings, idempotency key, and safety copy.

## Posting contract

Post endpoint:

```http
POST /api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/
```

Posting is:

- admin-only
- explicit confirmation only
- transactional
- idempotent per concrete source + event key + idempotency key
- tied to a concrete source record

Posting creates:

- one posted `JournalEntry`
- one `AccountingBridgePosting`
- one pending/unverified `ReconciliationItem`

Posting does not mutate original source financial fields. In particular, this bridge workflow does not set `posted_journal_entry` on billing or purchase documents and does not change amount, status, document number, source reference, tax values, invoice/receipt allocation, DirectSale, Payment, EMI, Subscription, StockLedger, PurchaseBill, Commission, Payout, Delivery, or rent/lease source data.

## Reconciliation contract

After posting, the row remains pending/unverified until explicit reconciliation verification.

Verification endpoint:

```http
POST /api/v1/admin/accounting/bridge-reconciliation/items/{id}/verify/
```

Verification is admin-only and applies only to clean `POSTED_UNVERIFIED` bridge reconciliation items. It does not mutate the source record.

## Period close impact

Bridge rows follow the same close posture across Payment, ReceiptDocument, BillingInvoice, BillingCreditNote, DirectSaleReturn, BillingDebitNote, and PurchaseBill:

- ready/unposted concrete rows block close as unposted bridge work
- posted/unverified rows block close as unreconciled work
- verified/reconciled rows no longer block close as unreconciled
- unsupported source shapes remain visible and non-postable

## Safety limits

Phase F6 does not add bridge posting for:

- DirectSale sale source records
- Rent/Lease source records
- StockLedger
- GoodsReceipt
- Vendor payment or settlement
- Purchase return
- Commission or payout
- salary or payroll
- StaffAdvance

Do not auto-post, auto-reconcile, auto-close periods, create fake mappings, mutate inventory, or fake Staff Advance readiness.
