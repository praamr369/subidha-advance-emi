# Roadmap: Bank Statement Import + UPI Settlement Import + Cashier Day Close (Additive)

Status: **DESIGN ONLY (docs-only)**  
Scope: deliver explicit settlement evidence ingestion + source links (manual matching first).

Reference architecture:
- `docs/architecture/bank-upi-cashier-settlement-design.md`
- `docs/architecture/cash-bank-upi-settlement-source-link-map.md`
- `docs/architecture/reconciliation-control-tower.md`
- `docs/roadmap/reconciliation-implementation-plan.md`

## Phase L0 — Schema foundation (P0)

Goal:
- Introduce additive tables for settlement evidence and explicit allocations.

Status:
- Implemented: **2026-05-22**

Files affected (implemented):
- `backend/settlements/models.py`
- Migration: `backend/settlements/migrations/0001_initial.py`
- Settings: `backend/core/settings/base.py` (adds `settlements` to `INSTALLED_APPS`)
- Tests: `backend/tests/settlements/test_models.py`

Backend changes (implemented):
- Add models:
  - `BankStatementImport`, `BankStatementLine`
  - `UpiSettlementImport`, `UpiSettlementLine`
  - `CashierDayClose`
  - `SettlementAllocation`

Frontend changes:
- None (schema only).

Risk level:
- Low (additive, unused by runtime until wired).

Test requirements (future):
- Migration applies.
- Model validation tests for:
  - checksum presence
  - line sign rules (debit/credit)
  - allocation “at least one target” rule

## Phase L1 — Admin import + parsing (P0)

Goal:
- Allow admin to upload bank statement and UPI settlement files; parse into line rows; store raw payload (evidence ingestion only).

Status:
- Implemented: **2026-05-22**

Backend changes (implemented):
- Parser services:
  - `backend/settlements/services/import_parser_service.py`
  - `backend/settlements/services/bank_statement_parser.py`
  - `backend/settlements/services/upi_settlement_parser.py`
- Admin-only API endpoints:
  - `POST/GET /api/v1/admin/settlements/bank-imports/`
  - `GET /api/v1/admin/settlements/bank-imports/{id}/`
  - `GET /api/v1/admin/settlements/bank-imports/{id}/lines/` (paginated)
  - `POST/GET /api/v1/admin/settlements/upi-imports/`
  - `GET /api/v1/admin/settlements/upi-imports/{id}/`
  - `GET /api/v1/admin/settlements/upi-imports/{id}/lines/` (paginated)

Frontend changes:
- None (Phase L1 backend foundation only).

Risk level:
- Medium (file handling, parser correctness, operator misunderstandings without UI guardrails).

Test requirements (implemented, backend):
- Upload creates import + lines.
- Raw payload preserved.
- Checksum stored.
- Duplicate upload rejected.
- Invalid CSV marks import `FAILED` and stores `metadata.parse_error`.
- Non-admin denied.
- Upload does not create `SettlementAllocation` and does not create reconciliation items.

## Phase L2 — Manual matching UI + SettlementAllocation (P0)

Goal:
- Implement operator manual matching: create `SettlementAllocation` rows linking statement/settlement lines to `Payment` / `ReceiptDocument` / `MoneyMovement`.

Status:
- Implemented: **2026-05-22**

Backend changes (implemented):
- Admin-only endpoints:
  - `GET /api/v1/admin/settlements/allocations/` (paginated list)
  - `POST /api/v1/admin/settlements/allocations/` (manual create)
  - `GET /api/v1/admin/settlements/allocations/{id}/` (detail)
  - `POST /api/v1/admin/settlements/allocations/{id}/void/` (void; never deletes)

Validation rules (implemented, enforced by service):
- `source_type` must be one of: `BANK_STATEMENT_LINE | UPI_SETTLEMENT_LINE | CASHIER_DAY_CLOSE`
- `source_id` must reference an existing source row
- `finance_account` must match deterministic source finance account:
  - BankStatementLine → BankStatementImport.bank_finance_account
  - UpiSettlementLine → UpiSettlementImport.upi_finance_account
  - CashierDayClose → CashierDayClose.finance_account (must be set)
- At least one target required: `payment` or `receipt` or `money_movement`
- `matched_amount` must be positive and cannot exceed remaining source amount after existing non-VOIDED/non-REJECTED allocations
- Partial allocations allowed (multiple allocations can be created until source amount is exhausted)
- Duplicate exact active allocation (same source + same target + same amount) is rejected

Void behavior (implemented):
- Voiding sets `SettlementAllocation.status = VOIDED` and records `metadata.voided_at`, `metadata.voided_by_id`, optional `metadata.void_reason`.
- No allocations are hard-deleted.

Non-goals (guaranteed):
- No auto-matching / no suggested matching.
- No reconciliation checks are created/closed.
- No mutation of `Payment`, `ReceiptDocument`, `MoneyMovement`, `JournalEntry`, finance accounts, cash counters, or any source financial records.

Frontend changes:
- Implemented: **2026-05-22**
- Admin-only settlement evidence UI:
  - `GET /admin/settlements` (overview and guardrail notes)
  - `GET /admin/settlements/bank-imports` (upload + list)
  - `GET /admin/settlements/bank-imports/{id}` (metadata + lines + manual allocation + allocation void)
  - `GET /admin/settlements/upi-imports` (upload + list)
  - `GET /admin/settlements/upi-imports/{id}` (metadata + lines + manual allocation + allocation void)
- Frontend files:
  - `frontend/src/app/(dashboard)/admin/settlements/page.tsx`
  - `frontend/src/app/(dashboard)/admin/settlements/bank-imports/page.tsx`
  - `frontend/src/app/(dashboard)/admin/settlements/bank-imports/[id]/page.tsx`
  - `frontend/src/app/(dashboard)/admin/settlements/upi-imports/page.tsx`
  - `frontend/src/app/(dashboard)/admin/settlements/upi-imports/[id]/page.tsx`
  - `frontend/src/services/settlements.ts`
  - `frontend/src/types/settlements.ts`

Guarantees (UI):
- Imports remain evidence only (no posting, no reconciliation closure).
- Manual allocations only (no auto-match, no suggestions).
- No new finance-account lookup/select endpoints are introduced in this phase.
- Lookup UX is admin-only and read-only using dedicated hardened settlement lookup endpoints (bounded and display-safe):
  - `GET /api/v1/admin/settlements/lookups/finance-accounts/?q=...&kind=BANK|UPI`
  - `GET /api/v1/admin/settlements/lookups/payments/?q=...`
  - `GET /api/v1/admin/settlements/lookups/receipts/?q=...`
  - `GET /api/v1/admin/settlements/lookups/money-movements/?q=...`

Risk level:
- Medium (operator workflow safety; must be hard to create wrong allocations accidentally).

Test requirements:
- Permission tests (admin-only).
- Allocation validation tests (at least one target, positive amount, status transitions).

## Phase L3 — Cashier Day Close capture (P1)

Goal:
- Add cashier day-close draft/submit + admin approve/reject, without mutating payments.

Context note:
- Current payment validity for cashier day-close is only deterministic for EMI payment reversals when `OperationalCancellation` exists.
- Future day-close design should add explicit receipt invalidation evidence and a clear day-close transaction linkage contract before adding reconciliation checks. In particular, receipts should not be treated as active or excluded settlement evidence solely by `ReceiptDocument.posted_journal_entry`; a dedicated invalidation event or explicit `OperationalCancellation.SourceType.BILLING_RECEIPT` linkage is required.
- The preferred path is a generic lifecycle event layer for financial source validity. See `docs/architecture/financial-source-lifecycle-event-design.md` for the additive design.

Backend changes (future):
- Cashier-scoped endpoints:
  - create day-close draft
  - submit
- Admin endpoints:
  - approve/reject/void
- Deterministic computation service for `system_cash_total` (read-only query of existing payments/receipts for the day/counter).

Frontend changes (future):
- Cashier page: day-close form (counter-scoped).
- Admin page: day-close review queue.

Risk level:
- Medium (operational adoption; must be fast and clear).

Test requirements:
- Cashier branch/counter scoping tests.
- Variance snapshot computation tests (deterministic totals for known fixtures).

## Phase L4 — Control Tower checks based on allocations (P1)

Goal:
- Add reconciliation exceptions that rely on explicit `SettlementAllocation` evidence (still no auto-correction).

Status:
- Implemented: **2026-05-22**

Backend changes (implemented):
- New service module:
  - `backend/reconciliation/services/settlement_allocation_reconciliation.py`
- Runner registration:
  - `backend/reconciliation/services/reconciliation_runner.py`

Implemented checks (deterministic allocation-backed detection; module=`settlement`):
- Bank/UPI line unallocated (active import + `matched_status=UNMATCHED` + no active allocations)
- Partial allocation (allocated < source amount)
- Over-allocation (allocated > source amount)
- Allocation finance account mismatch vs deterministic source finance account
- Allocation target invalid (no explicit target reference)
- Line `matched_status` mismatch (MATCHED/PARTIAL but all allocations are VOIDED/REJECTED)
- Cashier day-close variance unresolved (variance != 0 and not APPROVED/REJECTED/VOIDED)

Frontend changes:
- None (reuses existing Control Tower UI; module label is `settlement`).

Risk level:
- Low/Medium (deterministic evidence, but may expose operational gaps).

Test requirements:
- Service-layer reconciliation tests using factory data.
  - `backend/tests/reconciliation/test_phase_l_settlement_allocation_control_tower.py`

## Phase L5 — Suggested matching (P2)

Goal:
- Provide suggestion candidates for operator review; never auto-match.

Backend changes (future):
- Candidate search endpoints with scoring.
- Store suggestion metadata (optional) separate from `SettlementAllocation`.

Frontend changes (future):
- Candidate list UI and “confirm match” action.

Risk level:
- Medium (risk of operator over-trust; UI must clearly communicate “suggestion only”).

Test requirements:
- Scoring determinism tests and permission coverage.
