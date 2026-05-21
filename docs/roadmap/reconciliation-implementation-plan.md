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
- Purchase/GRN/vendor inventory checks unless explicit FK/source links are confirmed
- Delivery reservation/dispatched inventory checks until lifecycle + bridge contracts are explicitly confirmed

Tests (backend, targeted):
- `backend/tests/reconciliation/test_phase_i_inventory_stock_control_tower.py`

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
