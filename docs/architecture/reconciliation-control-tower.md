# System-wide Reconciliation Control Tower (Architecture + Audit)

Status: **AUDIT COMPLETE (docs-only)**  
Constraint: **Read-only detection + manual resolution notes/status only (Phase 1)**. No auto-correction of financial records.

## Phase F (Implemented 2026-05-21)

Phase F implements the first production Control Tower slice using only `READY_FOR_PHASE_F` deterministic links.

Additive backend app (new):
- `backend/reconciliation/` (models + services)
- Models: `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, `ReconciliationResolution`
- Migration: `backend/reconciliation/migrations/0001_initial.py`

Admin-only APIs (additive):
- Existing (unchanged): `GET /api/v1/admin/reconciliation/overview/` (finance settlement overview)
- New (Phase F Control Tower):
  - `GET /api/v1/admin/reconciliation/modules/`
  - `GET/POST /api/v1/admin/reconciliation/runs/`
  - `GET /api/v1/admin/reconciliation/runs/{id}/`
  - `GET /api/v1/admin/reconciliation/items/` (filters: `run,module,status,severity,exception_code,search`)
  - `GET /api/v1/admin/reconciliation/items/{id}/`
  - `POST /api/v1/admin/reconciliation/items/{id}/resolve/` (note required)
  - `POST /api/v1/admin/reconciliation/items/{id}/reopen/` (note required)

Implemented Phase F checks (read-only detection; no mutation of source financial records):
- Payment exists but no `ReceiptDocument` (`billing.ReceiptDocument.payment`)
- ReceiptDocument exists but payment link / receipt type constraints look invalid (deterministic)
- Payment exists but linked `Emi.status` remains `PENDING` (scoped to `Payment.emi_id`)
- `Emi.status=PAID` but no `FinancialLedger(entry_type=EMI_PAYMENT)` evidence (deterministic)
- Payment exists but missing `AccountingBridgePosting(source_model=Payment, purpose=PAYMENT_COLLECTION)`
- Bridge-created `JournalEntry` missing/mismatching `source_model/source_id` vs bridge row
- `JournalEntryGroup.is_balanced == False`
- Duplicate posted `JournalEntry` references for payment collection (`source_model=Payment`, `voucher_type=PAYMENT_COLLECTION`, `status=POSTED`)

Guarantees (Phase F):
- No auto-correction
- Manual actions update only `ReconciliationItem` status and append `ReconciliationResolution`
- Admin-only permission gate (`IsAdmin`) on all Control Tower endpoints

## Phase G (Implemented 2026-05-21)

Phase G extends the Control Tower check catalog to cover **direct-sale / billing / receipt** reconciliation using **explicit, deterministic source links only**.

Implemented Phase G checks (read-only detection; no mutation of source records; explicit links only):
- BillingInvoice is `POSTED/VOID` but `posted_journal_entry_id` is missing (HIGH)
- BillingInvoice `posted_journal_entry` exists but `JournalEntry.source_model/source_id` does not match the invoice (HIGH)
- Duplicate posted JournalEntry source reference for the same BillingInvoice (CRITICAL)
- BillingInvoice has `received_total > 0` but no POSTED ReceiptDocument linked via `ReceiptDocument.billing_invoice` (MEDIUM/HIGH)
- BillingInvoice amount fields inconsistent (`grand_total/received_total/balance_total` mismatch) (HIGH)
- BillingInvoice is `CANCELLED/VOID` but still has outstanding `balance_total > 0` (HIGH)
- ReceiptDocument has `billing_invoice_id` but linked customer/direct_sale fields are inconsistent with the invoice (HIGH)

Deferred in Phase G (explicitly not implemented here):
- Any stock/inventory-wide reconciliation relying only on `StockLedger.reference_model/reference_id` without a strict allowlist for this phase
- Return/exchange/refund lifecycle reconciliation (even when partially linkable) until rules + scope are confirmed per workflow
- Partial-payment allocation / receipt-to-invoice allocation checks unless the relationship is explicit and policy-stable
- End-to-end direct sale → stock → delivery → accounting checks that require inferred joins

Guarantees (Phase G):
- No auto-correction
- No mutation of BillingInvoice, ReceiptDocument, JournalEntry, AccountingBridgePosting, Payment, StockLedger, or other source rows
- Admin-only permission gate (`IsAdmin`) remains unchanged

## Phase H (Implemented 2026-05-21)

Phase H extends the Control Tower check catalog to cover **cancellation / returns / refunds** for direct-sale flows using **explicit deterministic links only**.

Implemented Phase H checks (read-only detection; no mutation of source records; explicit FK/OneToOne/source fields only):
- DirectSaleReturn internal totals mismatch (`grand_total != subtotal + tax_total`) (HIGH)
- DirectSaleReturn `original_invoice` link invalid (invoice belongs to a different direct_sale) (HIGH)
- DirectSaleReturn customer mismatch vs `original_invoice.customer` (HIGH, review)
- DirectSaleReturn is POSTED and requires a credit note (based on `metadata.financial_mode`) but `credit_note_id` is missing (HIGH)
- Return credit note is POSTED/VOID but `posted_journal_entry_id` is missing (HIGH)
- Return credit note posted journal exists but `JournalEntry.source_model/source_id` mismatch (HIGH)
- Return credit note `original_invoice_id` mismatch vs DirectSaleReturn.original_invoice_id (HIGH)
- BillingCreditNote internal totals mismatch (`total_adjustment != taxable_adjustment + tax_adjustment`) (HIGH)
- Duplicate posted journal source reference for a BillingCreditNote (CRITICAL)
- CustomerRefund customer mismatch vs linked DirectSaleReturn.customer (HIGH)
- CustomerRefund is PAID but `posted_journal_entry_id` is missing (HIGH)
- CustomerRefund posted journal exists but `JournalEntry.source_model/source_id` mismatch (HIGH)
- Duplicate posted journal source reference for a CustomerRefund (CRITICAL)

Explicitly deferred in Phase H (non-goals; not deterministic without additional explicit links):
- BillingInvoice “posted journal without reversal” checks (no explicit reversal-link contract available in current models)
- “Cancelled/void invoice still collectible” checks beyond `balance_total > 0` (no stable explicit collectible-field contract on BillingInvoice; operational visibility excludes CANCELLED/VOID via status alone)
- Stock restoration checks for returns if only `StockLedger.reference_model/reference_id` string references exist without a strict allowlist
- Exchange lifecycle checks (unless explicit FK + status contract is confirmed)
- Delivery reversal checks
- Payment refund allocation checks unless relationships are explicit
- End-to-end invoice → return → stock → accounting checks requiring inferred joins

Guarantees (Phase H):
- No auto-correction
- No mutation of BillingInvoice, DirectSale, DirectSaleReturn, CustomerRefund, BillingCreditNote, ReceiptDocument, JournalEntry, AccountingBridgePosting, StockLedger, customer, or other source rows
- Admin-only permission gate (`IsAdmin`) remains unchanged

## Phase I (Implemented 2026-05-21)

Phase I extends the Control Tower check catalog to cover **inventory / stock / manufacturing** using **strict allowlisted** `StockLedger.reference_model/reference_id` patterns only.

Implemented Phase I checks (read-only detection; no mutation of source records; allowlist-only):
- Allowlisted StockLedger rows with invalid `reference_id` format (HIGH).
- Posted DirectSaleReturn with `stock_effect=True` missing allowlisted stock restoration `SALE_RETURN_IN` evidence (HIGH).
- Posted DirectSaleReturn allowlisted restoration quantity mismatch (HIGH).
- Posted BillingInvoice missing allowlisted stock deduction `SALE_OUT` evidence per BillingInvoiceLine (HIGH).
- Completed ProductionJob missing allowlisted finished-good receipt stock evidence per posted ProductionReceiptLine (HIGH).
- Completed ProductionJob missing allowlisted raw-material issue/return stock evidence per posted ProductionMaterialIssueLine (HIGH).
- Negative stock detection when `InventoryItem.current_stock_quantity() < 0` (CRITICAL).

StockLedger allowlist (Phase I):
- `BillingInvoiceLine` (`reference_id`: `{invoice_id}:{line_id}`)
- `DirectSaleReturnLine` (`reference_id`: `{return_id}:{line_id}`)
- `ProductionMaterialIssueLine` (`reference_id`: `{line_id}`)
- `ProductionReceiptLine` (`reference_id`: `{line_id}`)

Explicitly deferred in Phase I:
- Any inventory reconciliation requiring guessed joins or non-allowlisted `reference_model/reference_id` interpretation
- Purchase/GRN/vendor inventory checks beyond strict allowlisted StockLedger evidence (e.g., vendor payable/accounting matching) unless explicit links are confirmed
- Delivery reservation/dispatched checks until lifecycle + bridge contracts are explicitly confirmed

## Phase J (Implemented 2026-05-22)

Phase J extends Phase I inventory checks to cover **purchase / GRN + delivery bridge + exchange replacement + stock adjustments** using **only** the allowlisted `StockLedger.reference_model/reference_id` contracts confirmed in Inventory Source-Link Hardening.

Implemented Phase J checks (read-only detection; no mutation; allowlist-only):
- GoodsReceiptLine (GRN) stock evidence:
  - `GOODS_RECEIPT_STOCK_IN_MISSING` (HIGH)
  - `GOODS_RECEIPT_STOCK_IN_QUANTITY_MISMATCH` (HIGH)
- PurchaseBillLine stock evidence (only for POSTED bills; matches current `post_purchase_bill` behavior):
  - `PURCHASE_BILL_STOCK_IN_MISSING` (HIGH)
  - `PURCHASE_BILL_STOCK_IN_QUANTITY_MISMATCH` (HIGH)
- PurchaseReturnLine stock evidence:
  - `PURCHASE_RETURN_STOCK_OUT_MISSING` (HIGH)
  - `PURCHASE_RETURN_STOCK_OUT_QUANTITY_MISMATCH` (HIGH)
- SubscriptionDelivery stock bridge evidence (terminal stock-relevant statuses only; deterministic qty=1.000):
  - `SUBSCRIPTION_DELIVERY_STOCK_BRIDGE_MISSING` (HIGH)
  - `SUBSCRIPTION_DELIVERY_STOCK_BRIDGE_QUANTITY_MISMATCH` (HIGH)
- Direct sale exchange replacement stock evidence (missing-ledger only; quantity mismatch deferred due to metadata-ordering risk):
  - `DIRECT_SALE_EXCHANGE_REPLACEMENT_STOCK_OUT_MISSING` (HIGH)
- StockAdjustmentLine stock evidence:
  - `STOCK_ADJUSTMENT_STOCK_MOVEMENT_MISSING` (HIGH)
  - `STOCK_ADJUSTMENT_STOCK_QUANTITY_MISMATCH` (HIGH)

Explicitly deferred in Phase J:
- Vendor payable/accounting reconciliation for purchase flows (journal/payable links are separate phases).
- Transfer workflows (no deterministic StockLedger writer/contract confirmed for Control Tower use yet).
- Delivery workflows beyond the confirmed SubscriptionDelivery bridge (reservation/dispatch routing).
- Exchange replacement quantity mismatch checks (replacement lines ordering is metadata-dependent).

## Phase K (Implemented 2026-05-22)

Phase K extends the Control Tower check catalog to cover **vendor payable / purchase accounting evidence** using **only** explicit links:
- OneToOne `posted_journal_entry` links on purchase/vendor models, and
- `JournalEntry.source_model/source_id` integrity.

Implemented Phase K checks (read-only detection; no mutation; explicit links only):
- PurchaseBill accounting evidence:
  - `PURCHASE_BILL_POSTED_JOURNAL_MISSING` (HIGH)
  - `PURCHASE_BILL_JOURNAL_SOURCE_LINK_INVALID` (HIGH)
  - `PURCHASE_BILL_DUPLICATE_JOURNAL_SOURCE_REFERENCE` (CRITICAL)
- VendorBill accounting evidence:
  - `VENDOR_BILL_POSTED_JOURNAL_MISSING` (HIGH)
  - `VENDOR_BILL_JOURNAL_SOURCE_LINK_INVALID` (HIGH)
  - `VENDOR_BILL_DUPLICATE_JOURNAL_SOURCE_REFERENCE` (CRITICAL)
- VendorPayment accounting evidence:
  - `VENDOR_PAYMENT_POSTED_JOURNAL_MISSING` (HIGH)
  - `VENDOR_PAYMENT_JOURNAL_SOURCE_LINK_INVALID` (HIGH)
  - `VENDOR_PAYMENT_DUPLICATE_JOURNAL_SOURCE_REFERENCE` (CRITICAL)
- PurchaseReturn accounting evidence (only where explicit posted_journal_entry exists):
  - `PURCHASE_RETURN_POSTED_JOURNAL_MISSING` (HIGH)
  - `PURCHASE_RETURN_JOURNAL_SOURCE_LINK_INVALID` (HIGH)
  - `PURCHASE_RETURN_DUPLICATE_JOURNAL_SOURCE_REFERENCE` (CRITICAL)

Modules used (admin-only queue labels):
- `purchase` (PurchaseBill, PurchaseReturn)
- `vendor` (VendorBill)
- `payable` (VendorPayment)

Explicitly deferred in Phase K:
- Vendor payable aging and balance reconciliation when balances are derived across ambiguous sources (no inferred joins).
- Vendor payment allocation matching when an explicit allocation FK/table is not present.
- Cash/bank/UPI settlement reconciliation (future phase; requires explicit settlement evidence links).

## 0) Phase E prerequisite (source-link determinism)

Phase E deliverable (docs-only):
- `docs/architecture/reconciliation-source-link-map.md`

Phase F must implement **only** checks classified as `READY_FOR_PHASE_F` in that source-link map to prevent noisy exceptions.

## 1) What Exists Today (Confirmed)

### Payment-level reconciliation (admin-only)

Models (existing):
- `PaymentReconciliation`: `backend/subscriptions/models.py`
- `PaymentReconciliationEvent`: `backend/subscriptions/models.py`

Admin API (existing, admin-only):
- `GET /api/v1/admin/reconciliations/` (filters: status/flagged/locked/payment/subscription/q)
- `GET /api/v1/admin/reconciliations/<id>/`
- `POST /api/v1/admin/reconciliations/<id>/flag/`
- `POST /api/v1/admin/reconciliations/<id>/note/`
- `POST /api/v1/admin/reconciliations/<id>/lock/`
- `POST /api/v1/admin/reconciliations/<id>/unlock/`
Implemented in: `backend/api/v1/views/admin_reconciliation.py`

Frontend surface (existing):
- `frontend/src/app/(dashboard)/admin/reconciliation/page.tsx`
- Service client: `frontend/src/services/reconciliation/index.ts`

### Finance account “settlement-style” reconciliation overview (admin-only)

Endpoint (existing):
- `GET /api/v1/admin/reconciliation/overview/`
Implemented in:
- `backend/api/v1/views/finance_operations.py` → `ReconciliationOverviewService`
- Frontend client: `frontend/src/services/finance-operations.ts`

This provides account-level pending settlement totals and flags.

### Accounting bridge records (structured source linking)

Models (existing):
- `JournalEntry` contains `source_model`, `source_id`, `source_reference`
  - `backend/accounting/models.py`
- `AccountingBridgePosting` is a unique `(source_model, source_id, purpose)` link to a posted journal entry
  - `backend/accounting/models.py`

This already forms a strong “evidence trail” for accounting reconciliation when source IDs are stable.

### Inventory traceability evidence

Inventory ledger records include:
- `reference_model` + `reference_id` and `posted_journal_entry_id` (as available)
  - `backend/inventory/models.py` (and services reference these fields heavily)

This provides a cross-module linkage mechanism, but it is string-based (not FK), so it requires careful normalization for control tower use.

## 2) Problem Statement

Reconciliation exists but is fragmented:

- payment reconciliation is per-payment and focused on EMI matching/variance
- finance operations reconciliation is per-finance-account settlement status
- accounting reconciliation exists via bridge postings and accounting control endpoints
- inventory traceability uses `reference_model/reference_id` but is not unified into reconciliation “runs”

There is currently no single, admin-only “Control Tower” that can answer:

- Which exceptions exist today across **payments, invoices, inventory posting, commissions, payouts, delivery bridges**?
- What evidence links an exception to the underlying source documents and posted journals?
- What manual resolution status/notes exist, and who applied them?

## 3) Control Tower Design (Additive, Does Not Replace Existing Systems)

The Control Tower should *not* replace:
- `PaymentReconciliation`
- existing bridge posting logic
- existing posting workflows (billing, inventory, commissions, payout batches)

Instead it should provide:
- a unified read-only **detection** layer
- admin-only **exception queue**
- manual **resolution tracking** (notes/status) without mutating financial history

## 4) Proposed Models (Design Only — Do Not Implement in This Pass)

These models are designed to be additive and to reference existing records without forcing schema changes to financial models.

### `ReconciliationRun`
Represents one execution of a deterministic set of checks.

Proposed fields:
- `id`
- `run_key` (string: identifies “control-tower daily run” vs ad-hoc)
- `scope` (JSON: date range, branch, module list; explicit and auditable)
- `status` (`STARTED` | `COMPLETED` | `FAILED`)
- `started_at`, `completed_at`
- `performed_by` (FK to internal user)
- `notes` (optional)

### `ReconciliationItem`
One exception row detected by a check.

Proposed fields:
- `id`
- `run` (FK)
- `check_key` (string enum: `PAYMENT_VARIANCE`, `MISSING_BRIDGE_POSTING`, `STOCK_LEDGER_MISMATCH`, etc.)
- `severity` (`INFO` | `WARNING` | `DANGER`)
- `status` (`OPEN` | `IN_REVIEW` | `RESOLVED` | `IGNORED`) — *control tower status only*
- `title`, `summary`
- `subject_model` + `subject_id` (string fields, not FK; supports cross-app references)
- `detected_values` (JSON: computed amounts, expected vs actual, ids)
- `created_at`

Important:
- Items must be deterministic for a given run scope.
- Items must not auto-close by mutating finance rows; they close only via explicit resolution.

### `ReconciliationEvidence`
Attaches evidence links to an item.

Proposed fields:
- `id`
- `item` (FK)
- `evidence_model` + `evidence_id` (e.g., `ReceiptDocument`, `JournalEntry`, `AccountingBridgePosting`, `StockLedger`)
- `label`
- `evidence_snapshot` (JSON: copy of key fields needed for audit)

### `ReconciliationResolution`
Manual resolution record (append-only in spirit).

Proposed fields:
- `id`
- `item` (FK)
- `resolution_type` (`NOTE` | `MARK_RESOLVED` | `MARK_IGNORED` | `REQUEST_ACTION`)
- `message`
- `actor` (FK internal user)
- `created_at`

## 5) Deterministic Checks (Phase 1: Read-only)

Phase 1 should focus on checks that can be computed from persisted records without guessing relationships.

### P0 checks (safe and deterministic)

1) **Payment variance exceptions**
- Source: existing `PaymentReconciliation` variance/status/flagged/locked.
- Control tower role: aggregate + triage view.

2) **Finance account settlement pending**
- Source: `ReconciliationOverviewService` outputs.
- Control tower role: queue “accounts with pending settlement amount”.

3) **Missing accounting bridge posting**
- Source: `AccountingBridgePosting` and `JournalEntry` relationships.
- Define checks per purpose:
  - retail sale bridge
  - inventory posting bridge
  - EMI subscription/payment/waiver bridge
  - commission settlement bridge
  - payout batch bridge
- Control tower role: “source exists but bridge posting/journal missing”.

4) **Inventory stock ledger link integrity**
- Source: `StockLedger.reference_model/reference_id`.
- Check: “ledger rows exist without expected reference patterns” (strictly for known flows only).

### Deferred checks (Phase 2+; require explicit source-link standardization)

- cross-module “money in vs invoice vs stock out vs delivery status” reconciliation
- return/exchange flows that use multiple reference_model patterns
- partner commission vs payout vs settlement timing checks

Rule: If a check requires guessing a relationship, it must be deferred until source links are made explicit in the data model.

## 6) Admin-only API Plan (Design Only)

New endpoints should be additive and admin-only:

- `GET /api/v1/admin/reconciliation-control/runs/`
- `POST /api/v1/admin/reconciliation-control/runs/` (kick off a run)
- `GET /api/v1/admin/reconciliation-control/items/?status=&severity=&check_key=&q=`
- `GET /api/v1/admin/reconciliation-control/items/<id>/`
- `POST /api/v1/admin/reconciliation-control/items/<id>/resolve/` (creates `ReconciliationResolution`)

Constraints:
- No endpoint in this system mutates payments, EMIs, receipts, invoices, stock ledgers, commissions, payouts, or accounting journals.

## 7) Frontend Control Tower Plan (Design Only)

Admin workspace UI should provide:
- a queue of exception items grouped by `check_key`
- filters (date range, branch, severity, status)
- drill-down panel showing:
  - evidence links (open payment detail, receipt register, journal entry detail, etc.)
  - resolution timeline (notes/decisions)

## 8) Non-negotiable Role Guard

- Customer and Partner roles must **never** access admin reconciliation control tower.
- Cashier access (if any) must be limited to cashier-safe queues (e.g., today’s receipts needing printing) and must never include accounting bridge controls.
