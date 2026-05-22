# Bank / UPI Statement Imports + Cashier Day Close — Additive Source-Link Design

Status: **DESIGN + PHASE L0/L1/L2 IMPLEMENTED (2026-05-22)**  
Scope: additive schema + admin-only import/parsing foundation + **manual SettlementAllocation workflow**.  
Non-goals: no payment posting change, no receipt generation change, no accounting posting change, no auto-match, no auto-correction, no mutation/backfill of historical financial records.

This design introduces **explicit source links** so future reconciliation checks can rely on deterministic evidence rather than free-text inference.

## 0) Current confirmed anchors (already in repo)

These links are already deterministic today and must remain unchanged:

- `subscriptions.Payment.finance_account` + `Payment.method` (`CASH|BANK|UPI`)
- `subscriptions.Payment.cash_counter` + `Payment.collected_by` + `Payment.branch`
- `billing.ReceiptDocument.finance_account` + optional `ReceiptDocument.cash_counter` + `ReceiptDocument.branch`
- `accounting.AccountingBridgePosting(source_model, source_id, purpose)` → `journal_entry` (OneToOne)
- `accounting.MoneyMovement(from_finance_account, to_finance_account)` → `posted_journal_entry` (OneToOne)

The missing piece is: **external settlement evidence ingestion** + **explicit allocations linking that evidence to internal records**.

## 1) Design goals

1. Additive schema only; no breaking changes.
2. Do not require changing `Payment` / `ReceiptDocument` / `MoneyMovement` source records.
3. Keep raw bank/UPI payloads for audit (append-only in spirit).
4. Every import has a checksum; every line has raw payload.
5. Manual matching first (explicit, audited). Suggested matching may be added later, but **never** becomes source-of-truth.
6. Reconciliation checks rely on **`SettlementAllocation`** (explicit links), not on free-text parsing.
7. Limit access to **admin/cashier internal roles only**; never expose to customer/partner/vendor roles.

## 1.1 Phase L1 implementation (2026-05-22)

Implemented (backend):
- Admin-only upload + checksum + CSV parser foundation:
  - `POST /api/v1/admin/settlements/bank-imports/`
  - `GET /api/v1/admin/settlements/bank-imports/`
  - `GET /api/v1/admin/settlements/bank-imports/{id}/`
  - `GET /api/v1/admin/settlements/bank-imports/{id}/lines/` (paginated)
  - `POST /api/v1/admin/settlements/upi-imports/`
  - `GET /api/v1/admin/settlements/upi-imports/`
  - `GET /api/v1/admin/settlements/upi-imports/{id}/`
  - `GET /api/v1/admin/settlements/upi-imports/{id}/lines/` (paginated)

Guarantees (explicit):
- Imports are evidence ingestion only: **no auto-match**, **no allocations**, **no reconciliation checks**, **no mutation of source financial records**.
- `raw_payload` stores the parsed row payload for each line (audit-friendly).
- `checksum` is computed via SHA-256 of uploaded file bytes.
- Duplicate uploads are rejected when `(checksum + finance_account + period/date)` matches an existing non-FAILED/non-VOIDED import.

Supported CSV formats (minimum columns):
- Bank statement CSV:
  - Required: `transaction_date`, `description`, `debit`, `credit`
  - Optional: `value_date`, `reference_no`, `balance`
- UPI settlement CSV:
  - Required: `transaction_ref`, `gross_amount`, `net_amount`, `settlement_date`
  - Optional: `payment_ref`, `fee_amount`

Notes:
- XLS/XLSX is intentionally not supported in Phase L1.
- Parsing rejects bank rows with both debit and credit > 0.
- Parsing rejects UPI rows where `settlement_date` does not match the import’s `settlement_date`.

## 1.2 Phase L2 implementation (2026-05-22)

Implemented (backend):
- Admin-only manual allocation endpoints:
  - `GET /api/v1/admin/settlements/allocations/` (paginated list)
  - `POST /api/v1/admin/settlements/allocations/` (manual create)
  - `GET /api/v1/admin/settlements/allocations/{id}/` (detail)
  - `POST /api/v1/admin/settlements/allocations/{id}/void/` (void; never deletes)

Guarantees (explicit):
- Manual operator action only: **no auto-match**, **no suggestions**, and **no reconciliation-side allocation creation/auto-match**, with **no source-record mutation** of:
  - `Payment`, `ReceiptDocument`, `MoneyMovement`, `JournalEntry`, `FinanceAccount`, `CashCounter`, imports, or historical ledger records.
- Voiding an allocation never deletes it; it only marks it `VOIDED` and records actor/time in `metadata`.

## 1.3 Phase L2.1 Admin settlement UI (2026-05-22)

Implemented (frontend; admin-only evidence surfaces):
- Overview:
  - `GET /admin/settlements`
- Bank statement imports:
  - `GET /admin/settlements/bank-imports`
  - `GET /admin/settlements/bank-imports/{id}`
- UPI settlement imports:
  - `GET /admin/settlements/upi-imports`
  - `GET /admin/settlements/upi-imports/{id}`

APIs reused (no new endpoints):
- Bank imports:
  - `POST/GET /api/v1/admin/settlements/bank-imports/`
  - `GET /api/v1/admin/settlements/bank-imports/{id}/`
  - `GET /api/v1/admin/settlements/bank-imports/{id}/lines/`
- UPI imports:
  - `POST/GET /api/v1/admin/settlements/upi-imports/`
  - `GET /api/v1/admin/settlements/upi-imports/{id}/`
  - `GET /api/v1/admin/settlements/upi-imports/{id}/lines/`
- Allocations:
  - `GET/POST /api/v1/admin/settlements/allocations/` (with `source_type` / `source_id` filters)
  - `POST /api/v1/admin/settlements/allocations/{id}/void/`

Upload behavior (guardrailed):
- Uses numeric finance-account IDs intentionally (no finance-account lookup selector added in this phase).
- Bank import POST fields:
  - `bank_finance_account`, `statement_period_from`, `statement_period_to`, `uploaded_file` (multipart)
- UPI import POST fields:
  - `upi_finance_account`, `settlement_date`, `uploaded_file` (multipart)

Manual allocation behavior (guardrailed):
- Manual allocations only; no auto-match, no suggested matching.
- Target selection is explicit and maps to existing API targets:
  - `payment` OR `receipt` OR `money_movement` (exactly one target should be provided per operator action)
- Allocations are displayed filtered by selected source line (uses `source_type` + `source_id` filters).
- Voiding an allocation uses the existing void endpoint and does not delete rows.

Non-goals remain enforced:
- No payment posting change.
- No receipt generation change.
- No accounting posting change.
- No reconciliation item creation/closure from the settlement pages.

Validation rules (enforced by service; summarized):
- `source_type` must be one of: `BANK_STATEMENT_LINE | UPI_SETTLEMENT_LINE | CASHIER_DAY_CLOSE`.
- `source_id` must reference an existing source row.
- `finance_account` must match the source import’s finance account where deterministic:
  - BankStatementLine → BankStatementImport.bank_finance_account
  - UpiSettlementLine → UpiSettlementImport.upi_finance_account
  - CashierDayClose → CashierDayClose.finance_account (must be set)
- At least one target required: `payment` or `receipt` or `money_movement`.
- `matched_amount` must be positive and cannot exceed remaining source amount after existing non-VOIDED/non-REJECTED allocations.
- Partial allocations are allowed.
- Duplicate exact active allocation (same source + same target + same amount) is rejected.

## 1.3 Phase L4 implementation (2026-05-22) — Allocation-backed reconciliation checks

Implemented (backend):
- Allocation-backed deterministic reconciliation checks using explicit `SettlementAllocation` evidence:
  - `backend/reconciliation/services/settlement_allocation_reconciliation.py` (registered in `backend/reconciliation/services/reconciliation_runner.py`)

Guarantees:
- Detection only (Control Tower items + evidence); no auto-correction.
- No auto-match, no suggested matching.
- No creation/voiding of `SettlementAllocation` from reconciliation.
- No mutation of `Payment`, `ReceiptDocument`, `MoneyMovement`, settlement imports/lines, cashier day-close rows, or allocations.

## 2) Proposed additive models (schema)

Recommended app placement (design): `backend/reconciliation/` (reconciliation evidence layer), because these records are reconciliation evidence + operator workflows, not accounting posting primitives.

### 2.1 `BankStatementImport`

Purpose: store one uploaded statement file + metadata + lifecycle status.

Fields:
- `import_no` (CharField, unique, indexed) — human-friendly identifier (e.g. `BSI-20260522-0001`).
- `bank_finance_account` (FK → `accounting.FinanceAccount`, PROTECT, indexed) — the **bank** account this statement belongs to.
- `statement_period_from` (DateField, indexed)
- `statement_period_to` (DateField, indexed)
- `uploaded_file` (FileField) — stored file (pdf/csv/xlsx) as received.
- `uploaded_by` (FK → `AUTH_USER_MODEL`, PROTECT)
- `uploaded_at` (DateTimeField, default now, indexed)
- `status` (TextChoices, indexed) — see “Import statuses” below.
- `checksum` (CharField, length 64, indexed) — SHA-256 hex of file bytes (or canonical normalized bytes if preprocessing is used; must be documented).
- `metadata` (JSONField) — bank name, account last4, parser hints, row counts, parse errors summary, etc.

Constraints / indexes (design intent):
- Unique: `import_no`
- Unique (optional, recommended): `(bank_finance_account, checksum)` to prevent accidental re-import of the same file.

Import statuses (proposed):
- `UPLOADED` (file stored, not parsed yet)
- `PARSED` (lines created)
- `READY_FOR_MATCHING` (operator can allocate)
- `FINALIZED` (imports locked from edits except admin “void” flow)
- `FAILED` (parse failed; keep file + errors for audit)
- `VOID` (explicitly voided; never deleted)

### 2.2 `BankStatementLine`

Purpose: store each bank ledger line (debit/credit) with raw payload and normalization helpers.

Fields:
- `import` (FK → `BankStatementImport`, CASCADE, indexed)
- `line_no` (PositiveIntegerField, indexed) — stable ordering within the import.
- `transaction_date` (DateField, indexed)
- `value_date` (DateField, null/blank, indexed)
- `description` (TextField)
- `reference_no` (CharField, blank/default "", indexed) — UTR/cheque/reference if present.
- `debit` (Decimal(12,2), default 0.00)
- `credit` (Decimal(12,2), default 0.00)
- `balance` (Decimal(12,2), null/blank) — keep if statement provides it.
- `raw_payload` (JSONField) — the parsed row as received (plus parser metadata).
- `normalized_reference` (CharField, blank/default "", indexed) — optional normalized key (e.g. cleaned UTR, masked ref, etc.). **Not** a settlement proof; only a helper for search/suggestions later.
- `matched_status` (TextChoices, indexed) — see “Line matched statuses” below.

Constraints / validation (design intent):
- Check: exactly one of `debit > 0` or `credit > 0` (allow both zero only for exceptional rows, but flag for review).
- Check: `(debit == 0) != (credit == 0)` preferred to keep deterministic line sign.
- Unique (recommended): `(import, line_no)`

Line matched statuses (proposed):
- `UNMATCHED`
- `PARTIALLY_MATCHED` (allocated amount < absolute line amount)
- `MATCHED` (allocated amount == absolute line amount)
- `IGNORED` (explicit operator decision; keep audit trail)

### 2.3 `UpiSettlementImport`

Purpose: store one uploaded settlement report (gateway export) + metadata.

Fields:
- `import_no` (CharField, unique, indexed) — human identifier (e.g. `UPI-20260522-0001`).
- `upi_finance_account` (FK → `accounting.FinanceAccount`, PROTECT, indexed) — typically `kind=UPI` or a `BANK` account used for gateway settlement collection; do not enforce strictly in schema to avoid breaking existing business configuration.
- `settlement_date` (DateField, indexed) — the settlement batch date.
- `uploaded_file` (FileField)
- `uploaded_by` (FK → `AUTH_USER_MODEL`, PROTECT)
- `uploaded_at` (DateTimeField, default now, indexed)
- `status` (TextChoices, indexed) — same lifecycle as bank statement import.
- `checksum` (CharField, length 64, indexed) — SHA-256 hex.
- `metadata` (JSONField) — gateway, merchant id, report range, row counts, parse errors, etc.

Constraints / indexes (design intent):
- Unique: `import_no`
- Unique (optional, recommended): `(upi_finance_account, checksum)`

### 2.4 `UpiSettlementLine`

Purpose: store each settlement row from the gateway export with raw payload.

Fields:
- `import` (FK → `UpiSettlementImport`, CASCADE, indexed)
- `line_no` (PositiveIntegerField, indexed)
- `transaction_ref` (CharField, blank/default "", indexed) — gateway transaction id / UTR-like reference.
- `payment_ref` (CharField, blank/default "", indexed) — gateway payment reference if separate.
- `gross_amount` (Decimal(12,2), default 0.00)
- `fee_amount` (Decimal(12,2), default 0.00)
- `net_amount` (Decimal(12,2), default 0.00)
- `settlement_date` (DateField, indexed) — repeated for convenience; should match import settlement_date.
- `raw_payload` (JSONField)
- `matched_status` (TextChoices, indexed) — same as bank statement line matched_status.

Constraints / validation (design intent):
- Check: `gross_amount >= 0`, `fee_amount >= 0`, `net_amount >= 0`
- Check (preferred): `net_amount == gross_amount - fee_amount` (allow mismatch but flag; gateways sometimes include taxes/adjustments)
- Unique (recommended): `(import, line_no)`

### 2.5 `CashierDayClose`

Purpose: capture an operator-declared day-close snapshot for a specific cash desk (cash counter) and the finance account it maps to.

This does **not** replace payment posting or money movements. It is a separate audited operational record that can be linked to `Payment` / `ReceiptDocument` / `MoneyMovement` via `SettlementAllocation`.

Fields:
- `close_no` (CharField, unique, indexed) — human identifier (e.g. `CDC-20260522-0003`).
- `cashier` (FK → `AUTH_USER_MODEL`, PROTECT, indexed) — cashier responsible for close.
- `branch` (FK → `branch_control.Branch`, PROTECT, indexed)
- `cash_counter` (FK → `branch_control.CashCounter`, PROTECT, indexed)
- `finance_account` (FK → `accounting.FinanceAccount`, PROTECT, indexed) — the cash desk settlement account bound to the counter.
- `business_date` (DateField, indexed) — the “shop day” being closed.
- `opening_cash` (Decimal(12,2), default 0.00)
- `system_cash_total` (Decimal(12,2), default 0.00) — a snapshot of system-computed expected cash for that date/counter at the time of close (computed by service later; stored for audit).
- `counted_cash` (Decimal(12,2), default 0.00) — cashier counted cash.
- `variance` (Decimal(12,2), default 0.00) — `counted_cash - system_cash_total` (stored, not inferred later).
- `status` (TextChoices, indexed) — see “Day close statuses” below.
- `closed_by` (FK → `AUTH_USER_MODEL`, PROTECT, null/blank) — who submitted/closed.
- `closed_at` (DateTimeField, null/blank, indexed)
- `approved_by` (FK → `AUTH_USER_MODEL`, PROTECT, null/blank)
- `approved_at` (DateTimeField, null/blank, indexed)
- `notes` (TextField, blank/default "")

Day close statuses (proposed):
- `DRAFT`
- `SUBMITTED` (cashier submits)
- `APPROVED` (admin approves variance explanation)
- `REJECTED` (admin rejects, returns to cashier)
- `VOID` (explicitly voided; never deleted)

Constraints / indexes (design intent):
- Unique (recommended): `(cash_counter, business_date, status!=VOID)` via application-level guard; DB-level partial unique is optional.

### 2.6 `SettlementAllocation`

Purpose: the **single explicit link table** that connects external settlement evidence (bank/UPI) and operational snapshots (day-close) to internal money records.

This is the design’s core: reconciliation checks should read allocations, not parse descriptions.

Fields:
- `source_type` (TextChoices, indexed):
  - `BANK_STATEMENT_LINE`
  - `UPI_SETTLEMENT_LINE`
  - `CASHIER_DAY_CLOSE`
- `source_id` (CharField, indexed) — stores the primary key of the source row as string.
  - `BankStatementLine.id`, `UpiSettlementLine.id`, or `CashierDayClose.id`
  - Using `(source_type, source_id)` keeps this additive and avoids hard schema coupling.
- `finance_account` (FK → `accounting.FinanceAccount`, PROTECT, indexed) — the settlement instrument account the allocation belongs to.
- `matched_amount` (Decimal(12,2), validators `> 0`, indexed)
- `status` (TextChoices, indexed):
  - `MATCHED` (manual match confirmed)
  - `REVERSED` (allocation reversed/voided explicitly; keep audit)
  - `VOID` (invalid allocation; keep audit)
- Optional internal links (nullable by design, explicit where deterministic):
  - `payment` (FK → `subscriptions.Payment`, PROTECT, null/blank, indexed)
  - `receipt` (FK → `billing.ReceiptDocument`, PROTECT, null/blank, indexed)
  - `money_movement` (FK → `accounting.MoneyMovement`, PROTECT, null/blank, indexed)
- `matched_by` (FK → `AUTH_USER_MODEL`, PROTECT, indexed)
- `matched_at` (DateTimeField, default now, indexed)
- `confidence` (PositiveSmallIntegerField, default 100) — `100` for manual matches; suggestion engine later may use lower values (but still requires explicit operator approval to create `MATCHED` allocations).
- `metadata` (JSONField) — free-form, e.g. UI notes, batch grouping id, rationale, references shown during match.

Constraints / validation (design intent):
- Check: at least one of `payment_id`, `receipt_id`, `money_movement_id` must be non-null.
- Check: `matched_amount > 0`.
- Unique (recommended): prevent duplicate same linkage:
  - `(source_type, source_id, payment)` when `payment_id` is not null
  - `(source_type, source_id, receipt)` when `receipt_id` is not null
  - `(source_type, source_id, money_movement)` when `money_movement_id` is not null

Notes:
- This design supports:
  - one statement line → multiple payments (split allocations)
  - one payment → multiple statement lines (partial settlements)
  - one line → money movements (settlement transfers)
  - day-close → payments/receipts covered by that close
- It intentionally does **not** compute totals; reconciliation checks compute totals from allocations and compare to line amounts/day-close snapshots.

## 3) Source links introduced by this design

After implementation (future phase), the following deterministic links exist:

- `BankStatementImport.bank_finance_account` → `FinanceAccount`
- `BankStatementLine` → `BankStatementImport` (explicit)
- `UpiSettlementImport.upi_finance_account` → `FinanceAccount`
- `UpiSettlementLine` → `UpiSettlementImport` (explicit)
- `CashierDayClose.cash_counter` → `CashCounter` → `FinanceAccount` (explicit)
- `SettlementAllocation(source_type, source_id)` → one of:
  - `BankStatementLine`
  - `UpiSettlementLine`
  - `CashierDayClose`
- `SettlementAllocation.payment/receipt/money_movement` → internal source records (explicit FKs)

No existing internal financial row needs to change to create these links.

## 4) Permission model (design)

Hard constraints:
- **Admin-only**: imports, allocations, approvals, voiding, and any reconciliation views built on these tables.
- **Cashier**: may create **CashierDayClose** drafts/submissions for their assigned counter (future UI), but must not see bank/UPI imports across accounts.

Recommended enforcement points (future implementation):
- DRF permissions:
  - `IsAdmin` for bank/UPI import + allocation APIs.
  - `IsCashierOrAdmin` only for cashier day-close submission APIs; admin can approve.
- Branch/counter scoping:
  - cashier can only act on their `assigned_cash_counters` (existing pattern in `branch_control.services.branch_service.assert_user_counter_access`).
- Never expose any of these endpoints to customer/partner/vendor audiences.

## 5) Manual matching workflow (operator-first)

Manual matching is the only allowed matching in the first implementation phase.

Flow (bank statement / UPI settlement):
1. Admin uploads statement/report → `*_Import` created (`status=UPLOADED`) with `checksum`.
2. Parser creates line rows → `*_Line` created (`status=PARSED` and line `matched_status=UNMATCHED`).
3. Admin opens a line and manually creates one or more `SettlementAllocation(status=MATCHED, confidence=100)` linking to:
   - `Payment` and/or `ReceiptDocument` (when deterministic)
   - `MoneyMovement` (for settlement transfers)
4. System updates line `matched_status` deterministically from allocations:
   - `MATCHED` if allocated total equals line amount (credit/debit or net amount)
   - `PARTIALLY_MATCHED` if allocated total is non-zero but not full
   - `UNMATCHED` if no allocations exist
5. All actions are auditable via:
   - allocation record itself (`matched_by`, `matched_at`, `metadata`)
   - optional linkage to Control Tower `ReconciliationResolution` notes (separate concern)

Flow (cashier day close):
1. Cashier opens day close for (cash_counter, business_date) → `CashierDayClose(status=DRAFT)`.
2. System computes `system_cash_total` for that day/counter (future service) and stores snapshot when cashier submits.
3. Cashier enters `opening_cash` and `counted_cash`, submits → `status=SUBMITTED`.
4. Admin reviews variance, may require notes; approves/rejects.
5. Optional: admin creates `SettlementAllocation` rows with `source_type=CASHIER_DAY_CLOSE` to link covered payments/receipts for audit (manual-only).

## 6) Future suggested matching workflow (explicitly non-authoritative)

Suggested matching may be added later, but must not auto-create `SettlementAllocation(status=MATCHED)` without human action.

Suggested matching inputs (non-exhaustive):
- `Payment.amount`, `payment_date`, `finance_account_id`, `cash_counter_id`
- `ReceiptDocument.amount`, `receipt_date`, `finance_account_id`
- `MoneyMovement.amount`, `movement_date`, `from/to finance account`
- `BankStatementLine.normalized_reference` or tokenized description (search only)
- `UpiSettlementLine.transaction_ref/payment_ref`

Suggested matching outputs:
- “Candidates” shown in UI with a score; operator explicitly chooses and confirms.
- Upon confirmation, the system creates `SettlementAllocation(status=MATCHED, confidence=<score>)` and logs operator action.

## 7) Reconciliation checks enabled once this schema exists (future)

Once implemented and populated (manual-only is enough), deterministic checks become possible:

Bank statement checks:
- Statement line is `MATCHED` but allocations exceed line amount (over-allocation).
- Statement line is `UNMATCHED` for > N days (aging exception).
- Statement line is `PARTIALLY_MATCHED` beyond tolerance window (exception).
- Allocations link to internal records on the wrong finance account (explicit mismatch).

UPI settlement checks:
- Net settlement line matched to gross payment amount without fee handling (policy check; design supports linking fee as separate allocation strategy).
- Gateway settlement line references a payment but allocation totals mismatch.

Cashier day close checks:
- Day close variance exceeds threshold and lacks admin approval (exception).
- Day close approved but no allocations exist for covered payments (policy-dependent; may be optional).

Cross-evidence checks:
- `Payment` has posted bridge journal but no allocation to any external settlement evidence after N days (requires policy; never infer).

## 8) Migration posture (design)

Additive migrations only:
- New tables for imports/lines/day close/allocations.
- No changes to `payments`, `billing_receipt_documents`, `accounting_money_movements`, `accounting_bridge_postings`, or journal tables.
- No backfill required to deploy schema safely (tables start empty).

Rollback posture:
- If needed, disable UI/API surfaces and stop writing new imports/allocations; existing financial records remain untouched.

---

## Phase L0 implementation (2026-05-22)

Implemented (schema + tests only):
- New Django app: `backend/settlements/` (added to `INSTALLED_APPS`)
- Models:
  - `BankStatementImport`, `BankStatementLine`
  - `UpiSettlementImport`, `UpiSettlementLine`
  - `CashierDayClose`
  - `SettlementAllocation`
- Migration: `backend/settlements/migrations/0001_initial.py`
- Tests: `backend/tests/settlements/test_models.py`

Intentionally not implemented in Phase L0:
- No import parsing service or file ingestion flow (no parser registry, no background jobs).
- No matching UI, no suggested matching, no auto-matching, no reconciliation checks.
- No mutation/backfill of `Payment`, `ReceiptDocument`, `MoneyMovement`, journals, or any historical financial records.
