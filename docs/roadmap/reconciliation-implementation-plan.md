# Reconciliation Control Tower — Implementation Plan (Additive)

Status: **PHASE I IMPLEMENTED (2026-05-21)**  
Phase 1 constraint: **read-only detection + manual resolution notes/status only**. No auto-correct.

Phase E prerequisite (docs-only, completed):
- `docs/architecture/reconciliation-source-link-map.md` (deterministic evidence map + Phase F readiness classification)

## Phase F Implementation (2026-05-21)

Backend (additive):
- New app: `backend/reconciliation/`
- Stored run + items + evidence + resolution models:
  - `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, `ReconciliationResolution`
- Runner: `backend/reconciliation/services/reconciliation_runner.py` (synchronous execution; read-only against source records)
- Checks implemented are limited to `READY_FOR_PHASE_F` deterministic links (see `docs/architecture/reconciliation-control-tower.md`)

Admin APIs (additive; admin-only):
- `GET /api/v1/admin/reconciliation/modules/`
- `GET/POST /api/v1/admin/reconciliation/runs/`
- `GET /api/v1/admin/reconciliation/runs/{id}/`
- `GET /api/v1/admin/reconciliation/items/` (+ filters)
- `GET /api/v1/admin/reconciliation/items/{id}/`
- `POST /api/v1/admin/reconciliation/items/{id}/resolve/`
- `POST /api/v1/admin/reconciliation/items/{id}/reopen/`

Frontend (additive):
- New Control Tower routes:
  - `frontend/src/app/(dashboard)/admin/reconciliation/runs/page.tsx`
  - `frontend/src/app/(dashboard)/admin/reconciliation/runs/[id]/page.tsx`
  - `frontend/src/app/(dashboard)/admin/reconciliation/items/[id]/page.tsx`

Tests (backend, targeted):
- `backend/tests/reconciliation/test_phase_f_control_tower.py`

## Phase G Implementation (2026-05-21)

Goal:
- Extend Control Tower with deterministic direct-sale / billing / receipt checks using explicit source links only.

Backend (additive):
- New service module:
  - `backend/reconciliation/services/direct_sale_reconciliation.py`
- Runner registration:
  - `backend/reconciliation/services/reconciliation_runner.py` runs Phase F checks + Phase G checks in the same run (still read-only detection).

Implemented checks (Phase G):
- BillingInvoice POSTED/VOID missing `posted_journal_entry_id`
- BillingInvoice journal source link mismatch
- Duplicate posted journal source reference for BillingInvoice
- BillingInvoice `received_total > 0` but no POSTED ReceiptDocument linked via `billing_invoice` FK
- BillingInvoice internal amount fields mismatch (balance vs computed)
- CANCELLED/VOID BillingInvoice still outstanding (balance_total > 0)
- ReceiptDocument → BillingInvoice link invalid (customer/direct_sale mismatch)

Tests (backend, targeted):
- `backend/tests/reconciliation/test_phase_g_direct_sale_billing_control_tower.py`

## Phase H Implementation (2026-05-21)

Goal:
- Add deterministic cancellation / void / return / refund reconciliation checks for billing + direct-sale flows using explicit source links only.

Backend (additive):
- New service module:
  - `backend/reconciliation/services/return_cancellation_reconciliation.py`
- Runner registration:
  - `backend/reconciliation/services/reconciliation_runner.py` runs Phase F + Phase G + Phase H checks in the same run (still read-only detection).

Implemented checks (Phase H):
- DirectSaleReturn internal amount fields mismatch (`grand_total != subtotal + tax_total`)
- DirectSaleReturn `original_invoice` invalid relative to `direct_sale` (explicit FK mismatch)
- DirectSaleReturn customer mismatch vs original_invoice customer (explicit FK mismatch)
- Posted DirectSaleReturn missing expected credit note when `metadata.financial_mode != NO_ACTIVE_CUSTOMER_VALUE`
- Posted/void BillingCreditNote missing expected `posted_journal_entry_id`
- BillingCreditNote posted journal source link mismatch (`JournalEntry.source_model/source_id`)
- Duplicate posted journal source reference for BillingCreditNote (CRITICAL)
- CustomerRefund paid missing expected `posted_journal_entry_id`
- CustomerRefund posted journal source link mismatch (`JournalEntry.source_model/source_id`)
- Duplicate posted journal source reference for CustomerRefund (CRITICAL)

Explicitly deferred in Phase H:
- BillingInvoice reversal/void journal pairing checks (no explicit reversal link contract available in current models)
- Broad inventory/stock restoration reconciliation (string reference-only; needs strict allowlist)
- Exchange lifecycle reconciliation (requires explicit FK + status contract confirmation)
- Refund allocation to receipts/payments unless the relationship is explicit

Tests (backend, targeted):
- `backend/tests/reconciliation/test_phase_h_returns_refunds_control_tower.py`

## Phase I Implementation (2026-05-21)

Goal:
- Add deterministic inventory / stock / manufacturing reconciliation checks using a strict allowlist for `StockLedger.reference_model/reference_id` patterns.
- Detection only (no auto-correction); do not mutate inventory/manufacturing/source records.

Backend (additive):
- New service module:
  - `backend/reconciliation/services/inventory_stock_reconciliation.py`
- Runner registration:
  - `backend/reconciliation/services/reconciliation_runner.py` runs Phase F + Phase G + Phase H + Phase I checks in the same run (still read-only detection).

Implemented checks (Phase I; allowlist-only):
- Allowlisted StockLedger invalid reference format (`STOCK_LEDGER_REFERENCE_FORMAT_INVALID`)
- Posted DirectSaleReturn missing allowlisted stock restoration (`DIRECT_SALE_RETURN_STOCK_RESTORATION_MISSING`)
- Posted DirectSaleReturn restoration quantity mismatch (`DIRECT_SALE_RETURN_STOCK_QUANTITY_MISMATCH`)
- Posted BillingInvoice missing allowlisted stock deduction (`BILLING_INVOICE_STOCK_DEDUCTION_MISSING`)
- Completed ProductionJob missing finished-good receipt stock entry (`PRODUCTION_JOB_FINISHED_GOOD_RECEIPT_STOCK_MISSING`)
- Completed ProductionJob missing raw-material issue/return stock entry (`PRODUCTION_JOB_RAW_MATERIAL_STOCK_MOVEMENT_MISSING`)
- Negative on-hand stock (`INVENTORY_NEGATIVE_STOCK`)

Explicitly deferred in Phase I:
- Any inventory reconciliation requiring non-allowlisted `reference_model/reference_id` interpretation
- Purchase/vendor inventory checks beyond strict allowlisted StockLedger evidence (e.g., payable/accounting matching) unless explicit links are confirmed
- Delivery reservation/dispatched inventory checks until lifecycle + bridge contracts are explicitly confirmed

Tests (backend, targeted):
- `backend/tests/reconciliation/test_phase_i_inventory_stock_control_tower.py`

## Phase J Implementation (2026-05-22)

Goal:
- Extend the Control Tower with deterministic **purchase / GRN + delivery + exchange** stock-evidence checks using only allowlisted `StockLedger.reference_model/reference_id` contracts.
- Detection only (no auto-correction); do not mutate StockLedger or source records.

Backend (additive):
- Extend existing module:
  - `backend/reconciliation/services/inventory_stock_reconciliation.py`

Implemented checks (Phase J; allowlist-only):
- GoodsReceiptLine evidence (`GOODS_RECEIPT_STOCK_IN_MISSING`, `GOODS_RECEIPT_STOCK_IN_QUANTITY_MISMATCH`)
- PurchaseBillLine evidence (`PURCHASE_BILL_STOCK_IN_MISSING`, `PURCHASE_BILL_STOCK_IN_QUANTITY_MISMATCH`)
- PurchaseReturnLine evidence (`PURCHASE_RETURN_STOCK_OUT_MISSING`, `PURCHASE_RETURN_STOCK_OUT_QUANTITY_MISMATCH`)
- SubscriptionDelivery bridge evidence (`SUBSCRIPTION_DELIVERY_STOCK_BRIDGE_MISSING`, `SUBSCRIPTION_DELIVERY_STOCK_BRIDGE_QUANTITY_MISMATCH`)
- Direct sale exchange replacement evidence (`DIRECT_SALE_EXCHANGE_REPLACEMENT_STOCK_OUT_MISSING`) (missing-ledger only)
- StockAdjustmentLine evidence (`STOCK_ADJUSTMENT_STOCK_MOVEMENT_MISSING`, `STOCK_ADJUSTMENT_STOCK_QUANTITY_MISMATCH`)

Explicitly deferred in Phase J:
- Vendor payable/accounting reconciliation (separate deterministic journal/payable linking phase).
- Transfers and delivery flows beyond the confirmed SubscriptionDelivery bridge.
- Exchange replacement quantity mismatch (metadata ordering risk).

Tests (backend, targeted):
- Extended:
  - `backend/tests/reconciliation/test_phase_i_inventory_stock_control_tower.py`

## Phase K Implementation (2026-05-22)

Goal:
- Add deterministic **vendor payable / purchase accounting evidence** checks using explicit `posted_journal_entry` OneToOne links and `JournalEntry.source_model/source_id` integrity.
- Detection only (no auto-correction); do not mutate PurchaseBill/VendorBill/VendorPayment/PurchaseReturn/JournalEntry source rows.

Backend (additive):
- New service module:
  - `backend/reconciliation/services/vendor_payable_reconciliation.py`
- Runner registration:
  - `backend/reconciliation/services/reconciliation_runner.py` runs Phase F + G + H + I + J + K checks in the same run (read-only detection).

Implemented checks (Phase K; explicit-link only):
- PurchaseBill posted journal missing / invalid source link / duplicate posted journal source reference
- VendorBill posted journal missing / invalid source link / duplicate posted journal source reference
- VendorPayment posted journal missing / invalid source link / duplicate posted journal source reference
- PurchaseReturn posted journal missing / invalid source link / duplicate posted journal source reference

Explicitly deferred in Phase K:
- Vendor payable aging/balance checks if payable/balance is derived across ambiguous sources (no inferred joins).
- Payment allocation matching when allocation tables/FKs are not explicit.
- Cash/bank/UPI settlement reconciliation (future phase with explicit settlement evidence links).

Tests (backend, targeted):
- New:
  - `backend/tests/reconciliation/test_phase_j_vendor_payable_control_tower.py`

## Inventory Source-Link Hardening (Preparation Phase, additive) (2026-05-21)

Goal:
- Standardize and document deterministic `StockLedger(reference_model, reference_id)` contracts for remaining stock workflows **before** adding new inventory reconciliation checks.

Constraints:
- No changes to stock movement business behavior
- No mutation/backfill of historical `StockLedger` rows in this phase
- No new reconciliation checks (only docs + helper constants + tests that prove existing behavior)

Deliverables:
- Canonical contract registry doc:
  - `docs/architecture/inventory-stock-source-link-contracts.md`
- Update source-link map to reference the canonical contract doc:
  - `docs/architecture/reconciliation-source-link-map.md` (section 3.10)
- Add (optional) centralized helper constants/functions for reference construction (no output changes):
  - `backend/inventory/stock_ledger_reference_contracts.py`
- Expand Phase I `StockLedger` allowlist **only** for workflows whose reference formats are proven by code/tests:
  - Goods receipt / GRN (`GoodsReceiptLine`)
  - Purchase bills (`PurchaseBillLine`)
  - Purchase returns (`PurchaseReturnLine`)
  - Stock adjustments (`StockAdjustmentLine`)
  - Opening stock (`OpeningStockEntry`, `OpeningStockImport`)
  - Delivery bridge (`SubscriptionDelivery`)
  - Exchange replacement (`DirectSaleExchangeReplacement`)

Tests (backend, targeted):
- Extend existing tests to assert `reference_model/reference_id` formats for the above workflows (no behavioral changes).

## 0) Starting Point (Confirmed in repo)

Existing reconciliation surfaces:
- Payment reconciliation model + admin API:
  - `backend/subscriptions/models.py` (`PaymentReconciliation`, `PaymentReconciliationEvent`)
  - `backend/api/v1/views/admin_reconciliation.py`
  - `frontend/src/app/(dashboard)/admin/reconciliation/page.tsx`
- Finance account operational reconciliation overview:
  - `backend/accounting/services/reconciliation_overview_service.py`
  - `GET /api/v1/admin/reconciliation/overview/`
- Accounting bridge postings:
  - `backend/accounting/models.py` (`AccountingBridgePosting`, `JournalEntry.source_*`)
- Inventory trace evidence:
  - stock ledger `reference_model/reference_id` patterns across posting services

## 1) Phase 1 (P0): Control Tower “Read-only + Notes” MVP

### Goal
Create a single admin-only “Control Tower” surface that aggregates and triages:
- payment reconciliation exceptions
- finance account settlement pending
- missing/failed accounting bridge posting signals (where deterministically detectable)

### Backend (additive)
- Add a new admin-only read model layer (implementation choice later):
  - either purely computed response endpoints, or
  - stored `ReconciliationRun/Item` models (only if needed for audit permanence)

Strong recommendation for Phase 1:
- Start with **computed** endpoints to avoid migrations until the check catalog stabilizes.

Phase F scope rule:
- Implement only checks tagged `READY_FOR_PHASE_F` in `docs/architecture/reconciliation-source-link-map.md`.

### Frontend (additive)
- Add a new admin workspace route under existing admin structure (design only here):
  - Queue of “checks” (cards): Payments, Finance Accounts, Accounting Bridges
  - Each shows counts and drilldown views

### Manual resolution tracking (Phase 1)
Do not mutate finance records.
Store only:
- resolution notes
- status labels (`OPEN`, `IN_REVIEW`, `RESOLVED`, `IGNORED`)
- actor + timestamp

If Phase 1 is computed-only, the resolution layer must still be persisted (either as:
- a dedicated reconciliation-resolution table keyed by `check_key + subject`, or
- reuse existing reconciliation notes where models already exist, e.g. `PaymentReconciliation.notes`).

## 2) Phase 2 (P1): Evidence attachments and deterministic “runs”

### Goal
Introduce explicit runs and evidence snapshots so reconciliation can be audited over time.

Backend:
- Add models described in `docs/architecture/reconciliation-control-tower.md`:
  - `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, `ReconciliationResolution`
- Run execution remains read-only detection:
  - computes items
  - stores snapshots/evidence

Frontend:
- Add item drilldown with evidence links:
  - payment detail
  - receipt register / receipt pdf
  - invoice detail / invoice pdf
  - journal entry detail
  - bridge posting register

## 3) Phase 3 (P2): Extend check catalog (only when source links are explicit)

Only introduce checks that can be proven deterministically from stored references.

Examples (to confirm later):
- invoice totals vs receipts posted vs outstanding ledger
- stock-out vs delivery status bridges
- commission settled vs payout batch posted vs journal entries

## 4) Explicit Non-goals (for all phases)

- No silent mutation of payments/EMIs/waivers/commissions/payouts/journals.
- No auto-correction.
- No customer/partner access to admin reconciliation control surfaces.

## 5) Test plan (when implemented)

Backend tests (minimum):
- permission tests: admin-only endpoints
- deterministic checks produce expected counts given fixtures
- resolution logging is append-only and auditable
- no finance model mutations happen when running checks

Frontend checks (minimum):
- loading/empty/error states for each queue
- role guard: ADMIN only
- deep-link navigation correctness for evidence links
