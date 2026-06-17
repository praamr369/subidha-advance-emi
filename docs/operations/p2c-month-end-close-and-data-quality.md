# P2C — Month-End Close and Data Quality Center

Backend-only. No frontend changes. Additive to P0, P1, P2A, and P2B.

## What was added

Two enterprise close primitives: (1) month-end close readiness + execution engine backed by 10 checks, and (2) a data quality center with 11 stable read-only checks.

---

## 1. MonthEndCloseRun + MonthEndCloseCheckResult

**Tables:** `control_month_end_close_runs`, `control_month_end_close_check_results`

**Purpose:** Run a battery of 10 integrity checks for a given calendar month. In dry-run mode, persists results for review without executing the close. In execute mode, only succeeds if all BLOCKING checks pass, then records the run as EXECUTED.

**No financial record is mutated in either mode.**

### Run statuses

| Status | Meaning |
|--------|---------|
| `DRY_RUN` | Checks persisted, nothing executed |
| `EXECUTED` | All BLOCKING checks passed; close recorded |
| `BLOCKED` | Execute attempted but BLOCKING check(s) failed |

### Check battery (10 checks)

| Check key | Severity | What it verifies |
|-----------|----------|-----------------|
| `all_daily_closes_complete` | BLOCKING | Every date in month with a CashCounterSession has an EXECUTED DailyCloseRun |
| `no_critical_exceptions` | BLOCKING | No OPEN/ACKNOWLEDGED CRITICAL ControlExceptions (P2A) |
| `period_not_already_closed` | BLOCKING | AccountingPeriod for the month is OPEN (not LOCKED/CLOSED) |
| `no_draft_manual_journals` | WARNING | No DRAFT manual JournalEntries for the period dates |
| `bridge_postings_ready` | WARNING | No accounting bridge mapping errors or unconfigured events |
| `cash_bank_reconciliation_clean` | WARNING | No FLAGGED/MISMATCH PaymentReconciliations for the period |
| `customer_advance_clean` | WARNING | No UNAPPLIED CustomerAdvances on or before period end |
| `security_deposit_reconciliation` | WARNING | No REFUND_APPROVED deposit transactions still ACTIVE on or before period end |
| `inventory_valuation_reviewed` | INFO | Inventory readiness snapshot has no blocking status |
| `trial_balance_balanced` | INFO | Deferred — no automated TB service yet; always passes |

### Service API

```python
from subscriptions.services.control_month_end_close_service import (
    get_month_end_readiness,
    run_month_end_close,
    build_month_end_close_run_payload,
)

# Non-persisting readiness check (GET endpoint)
readiness = get_month_end_readiness(year=2026, month=6, branch=None)
# → { can_execute: bool, blocking_count: int, checks: [...] }

# Dry run (persisted)
run = run_month_end_close(year=2026, month=6, run_by=admin, is_dry_run=True)

# Execute (blocked if BLOCKING checks fail)
run = run_month_end_close(year=2026, month=6, run_by=admin, is_dry_run=False)
```

---

## 2. Data Quality Center

**Purpose:** 11 read-only checks that surface data integrity issues across customers, products, inventory, contracts, payments, and accounting.

### Check list

| Check key | Severity | What it verifies |
|-----------|----------|-----------------|
| `duplicate_phones` | CRITICAL | Customers sharing the same phone number |
| `rejected_kyc_with_active_rent_lease` | CRITICAL | Active rent/lease subscriptions with rejected-KYC customers |
| `customers_without_phone` | WARNING | Customers with blank phone field |
| `products_without_category` | WARNING | Active products with no category_master and no category text |
| `products_without_inventory_profile` | WARNING | Active products without an InventoryItem record |
| `rent_products_without_pricing` | WARNING | Rent-enabled products where is_rent_ready=False |
| `active_contracts_without_number` | WARNING | ACTIVE subscriptions with null/blank contract_reference |
| `payments_without_receipt` | WARNING | Payment records with no linked ReceiptDocument |
| `stock_items_without_cost` | WARNING | InventoryItems with zero/null standard_unit_cost |
| `finance_accounts_without_mapping` | WARNING | Active FinanceAccounts with no active COA mapping |
| `delivered_without_receipt_document` | INFO | Delivered subscriptions where no payment has a receipt document |

### Service API

```python
from subscriptions.services.control_data_quality_service import get_data_quality_report

report = get_data_quality_report()
# → { critical_count, warning_count, total_issues, checks: [...] }
```

---

## 3. REST endpoints

All endpoints: `IsAuthenticated + IsAdmin`.

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/admin/control/month-end-close/readiness/` | Non-persisting readiness snapshot |
| POST | `/api/v1/admin/control/month-end-close/execute/` | Dry-run or execute close |
| GET | `/api/v1/admin/control/month-end-close/history/` | List past MonthEndCloseRun records |
| GET | `/api/v1/admin/data-quality/` | Full DQ check report |

### Readiness query params

```
GET /api/v1/admin/control/month-end-close/readiness/?year=2026&month=6
GET /api/v1/admin/control/month-end-close/readiness/?year=2026&month=6&branch_id=1
```

### Execute body

```json
{
  "year": 2026,
  "month": 6,
  "is_dry_run": false,
  "branch_id": 1,
  "notes": "June 2026 close"
}
```

HTTP 201 → DRY_RUN or EXECUTED. HTTP 409 → BLOCKED (blocking checks listed in `checks` array).

---

## 4. Migration

`0093_month_end_close.py` — creates two new tables. No existing table is touched.

---

## 5. Financial integrity impact

None. No Payment, EMI, JournalEntry, AccountingBridgePosting, CustomerAdvance, or any financial record is created or mutated by P2C. MonthEndCloseRun only reads existing records to run checks. DQ checks are read-only count queries.

## 6. Auditability impact

Positive. Every MonthEndCloseRun (dry-run and executed) writes an AuditLog entry. MonthEndCloseCheckResult provides a permanent audit trail of which checks passed/failed and why at each close attempt.

## 7. Daily shop usability impact

None today (no frontend). When the admin UI is added (P2D), the control desk will surface these checks before month-end.

## 8. Rent/lease compatibility

No impact. The security deposit and KYC checks proactively surface rent/lease data quality issues. Rent/lease payments flow normally through existing models.

## 9. Deferred

- Frontend control desk UI for month-end close: P2D.
- Trial balance check: deferred (no TB service yet; always passes).
- Auto-locking of AccountingPeriod on EXECUTED close: deferred to avoid side effects.
- Branch-scoped DQ checks: checks are currently global; branch scoping can be added additively.
- Cron-triggered monthly readiness report: P2E system jobs.
