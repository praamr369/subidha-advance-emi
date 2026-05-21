# Reconciliation Control Tower — Implementation Plan (Additive)

Status: **PLAN ONLY (no implementation in this pass)**  
Phase 1 constraint: **read-only detection + manual resolution notes/status only**. No auto-correct.

Phase E prerequisite (docs-only, completed):
- `docs/architecture/reconciliation-source-link-map.md` (deterministic evidence map + Phase F readiness classification)

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
