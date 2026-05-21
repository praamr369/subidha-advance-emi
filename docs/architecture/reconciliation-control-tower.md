# System-wide Reconciliation Control Tower (Architecture + Audit)

Status: **AUDIT COMPLETE (docs-only)**  
Constraint: **Read-only detection + manual resolution notes/status only (Phase 1)**. No auto-correction of financial records.

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

