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

Files affected (future implementation):
- `backend/reconciliation/models.py` (add new models) or a new module imported from it.
- New migration: `backend/reconciliation/migrations/0002_settlement_imports_and_allocations.py`

Backend changes (future):
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
- Allow admin to upload bank statement and UPI settlement files; parse into line rows; store raw payload.

Backend changes (future):
- Admin-only API endpoints:
  - create/list/detail imports
  - upload file + compute checksum
  - parse (sync for small files; background later)
- Parser registry (bank/gateway specific) with strict audit logging.

Frontend changes (future):
- Admin pages:
  - bank statement import list/detail
  - UPI settlement import list/detail
  - line list and drilldown

Risk level:
- Medium (file handling, parser correctness).

Test requirements:
- Parser unit tests with known fixtures.
- Ensure raw payload stored and stable.
- Ensure checksum prevents accidental duplicate import (if enabled).

## Phase L2 — Manual matching UI + SettlementAllocation (P0)

Goal:
- Implement operator manual matching: create `SettlementAllocation` rows linking statement/settlement lines to `Payment` / `ReceiptDocument` / `MoneyMovement`.

Backend changes (future):
- Admin-only endpoints:
  - create/list/delete/void allocations (never hard-delete; reverse/void instead)
  - line-level allocation totals summary endpoints (read-only)

Frontend changes (future):
- Admin-only allocation workflow:
  - search internal candidates (payments/receipts/money movements) by date/amount/account
  - add allocations with notes

Risk level:
- Medium (operator workflow safety; must be hard to create wrong allocations accidentally).

Test requirements:
- Permission tests (admin-only).
- Allocation validation tests (at least one target, positive amount, status transitions).

## Phase L3 — Cashier Day Close capture (P1)

Goal:
- Add cashier day-close draft/submit + admin approve/reject, without mutating payments.

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

Backend changes (future):
- Add module(s) to `backend/reconciliation/services/reconciliation_runner.py`:
  - unmatched aging checks
  - over/under allocation checks
  - wrong-account allocation checks
  - day-close variance approval checks

Frontend changes (future):
- Control Tower module view additions for the new settlement evidence queues.

Risk level:
- Low/Medium (deterministic evidence, but may expose operational gaps).

Test requirements:
- Service-layer reconciliation tests using factory data.

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

