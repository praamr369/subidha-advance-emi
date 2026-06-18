# P4A — Financial Intelligence Readiness

**Phase:** P4A  
**Status:** Backend complete (service + API + tests). Frontend UI deferred to P4B.  
**Branch:** `update`  
**All endpoints:** Admin-only, read-only. No financial records are created or mutated.

---

## Overview

P4A adds a read-only **Financial Intelligence Readiness** layer to SUBIDHA CORE.  
It provides a single admin endpoint that returns a snapshot of financial health across seven diagnostic sections, a normalised action-items list, and an overall severity status.

This is **diagnostic-only**. It does not post journals, create bridge entries, or fix gaps. Its purpose is to surface blockers for month-end close, accounting integrity risks, and data quality issues that require operator attention.

---

## API

### Main Snapshot

```
GET /api/v1/admin/financial-intelligence/
```

Query parameters:

| Param    | Type       | Description                              | Default          |
|----------|------------|------------------------------------------|------------------|
| `as_of`  | YYYY-MM-DD | Reference date for snapshot              | Today            |
| `year`   | integer    | Period year                              | Year of `as_of`  |
| `month`  | integer    | Period month (1-12)                      | Month of `as_of` |

**Response shape:**

```json
{
  "as_of": "2026-06-18",
  "period": { "year": 2026, "month": 6 },
  "overall_status": "OK | INFO | WARNING | CRITICAL",
  "sections": {
    "collection": { ... },
    "billing": { ... },
    "bridge": { ... },
    "reconciliation": { ... },
    "advance_deposit": { ... },
    "control": { ... },
    "inventory_finance": { ... }
  },
  "action_items": [ ... ]
}
```

### Sub-section Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/admin/financial-intelligence/bridge-posture/` | Bridge posture only |
| `GET /api/v1/admin/financial-intelligence/reconciliation-posture/` | Reconciliation posture only |
| `GET /api/v1/admin/financial-intelligence/control-posture/` | Control close posture only |
| `GET /api/v1/admin/financial-intelligence/action-items/` | Action items list only |

---

## Sections Returned

### A. Collection Posture (`sections.collection`)

| Field | Description |
|-------|-------------|
| `period_payment_count` | Total payments in selected period |
| `period_payment_amount` | Total payment amount in period |
| `method_split` | Count/amount split by CASH / UPI / BANK |
| `reversed_payment_count` | Payments with reversal metadata |
| `missing_receipt_count` | Payments without linked ReceiptDocument |
| `status` | OK / WARNING / CRITICAL |
| `warnings` | Human-readable warning messages |

**Status rules:**
- `missing_receipt_count > 0` → WARNING

---

### B. Billing Posture (`sections.billing`)

| Field | Description |
|-------|-------------|
| `invoice_count` | Active billing invoices in period |
| `invoice_amount` | Grand total of those invoices |
| `invoices_without_receipt_count` | Invoices with no linked receipt |
| `direct_sale_count` | Non-cancelled direct sales in period |
| `direct_sale_amount` | Grand total of direct sales |
| `rent_lease_demand_count` | Rent/lease demands due in period |
| `rent_lease_demand_amount` | Total demand amount |
| `overdue_demand_count` | Demands in OVERDUE status (all-time) |
| `status` | OK / WARNING / CRITICAL |

**Status rules:**
- `invoices_without_receipt_count > 0` → WARNING
- `overdue_demand_count > 0` → WARNING

---

### C. Accounting Bridge Posture (`sections.bridge`)

Bridge postings reflect journal entries linked to source records. `AccountingBridgePosting` itself has no status field; status derives from the linked `JournalEntry.status`.

| Field | Description |
|-------|-------------|
| `total_bridge_postings` | All-time bridge posting count |
| `total_posted` | With POSTED journal entries |
| `total_draft` | With DRAFT journal entries (incomplete) |
| `total_void` | With VOID journal entries |
| `period_bridge_postings` | Bridge postings with event date in period |
| `period_posted` | Period postings that are POSTED |
| `period_draft` | Period postings that are DRAFT |
| `purpose_breakdown` | Top 10 purposes by posting count |
| `damage_deduction_posture` | P1 damage deduction bridge summary |
| `rent_lease_bridge_posture` | Rent/lease and deposit bridge summary |
| `status` | OK / WARNING / CRITICAL |

**Status rules:**
- `total_draft > 0` → WARNING (DRAFT journal entries indicate incomplete postings)

**Important:** This section does not trigger automatic re-posting. It is diagnostic only.

---

### D. Reconciliation Posture (`sections.reconciliation`)

Reads from `ReconciliationItem` rows created by previous reconciliation runs.

| Field | Description |
|-------|-------------|
| `total_unresolved_items` | Items not in RESOLVED / FALSE_POSITIVE / WAIVED / MATCHED |
| `critical_unresolved` | Unresolved items with CRITICAL severity |
| `high_unresolved` | Unresolved items with HIGH severity |
| `amount_mismatch_count` | Items in AMOUNT_MISMATCH status |
| `stale_item_count` | Unresolved items created > 30 days ago |
| `last_reconciliation_run_at` | Timestamp of most recent completed run |
| `last_reconciliation_run_module` | Module name of that run |
| `status` | OK / WARNING / CRITICAL |

**Status rules:**
- `critical_unresolved > 0` → CRITICAL
- `high_unresolved > 0` → WARNING
- `stale_item_count > 0` → WARNING

---

### E. Customer Advance / Security Deposit Posture (`sections.advance_deposit`)

| Field | Description |
|-------|-------------|
| `customer_advance.total_count` | All CustomerAdvance records |
| `customer_advance.total_amount` | Total amount across all advances |
| `customer_advance.total_unapplied_amount` | Sum of unapplied_amount across all advances |
| `customer_advance.open_unapplied_count` | UNAPPLIED or PARTIALLY_APPLIED with unapplied_amount > 0 |
| `customer_advance.liability_mismatch_count` | FULLY_APPLIED records with unapplied_amount > 0 (data quality risk) |
| `security_deposit.collected_count/amount` | COLLECTED/DEPOSIT_RECEIPT transactions |
| `security_deposit.refunded_count/amount` | REFUNDED/DEPOSIT_REFUND transactions |
| `security_deposit.deducted_count/amount` | DEDUCTION transactions |
| `security_deposit.deposit_transactions_without_bridge` | Deposit transactions with no AccountingBridgePosting |
| `status` | OK / WARNING |

**Status rules:**
- `liability_mismatch_count > 0` → WARNING
- `deposit_transactions_without_bridge > 0` → WARNING

---

### F. Control Close Posture (`sections.control`)

Aggregates state from P2A (ControlException), P2B (CashCounterSession, DailyCloseRun), and P2C (MonthEndCloseRun).

#### `control.control_exceptions`

| Field | Description |
|-------|-------------|
| `open_critical_high_count` | Open exceptions with CRITICAL or HIGH severity |
| `open_warning_count` | Open WARNING exceptions |
| `total_open_count` | All open exceptions |
| `status` | OK / WARNING / CRITICAL |

**Status rules:**
- `open_critical_high_count > 0` → CRITICAL
- `open_warning_count > 0` → WARNING

#### `control.cash_desk`

| Field | Description |
|-------|-------------|
| `open_sessions_count` | Sessions in OPEN state (all branches) |
| `variance_pending_count` | Sessions in VARIANCE_PENDING_APPROVAL |
| `period_dates_missing_close` | Days in period with sessions but no EXECUTED daily close |
| `latest_daily_close_date` | Most recent DailyCloseRun date in period |
| `latest_daily_close_status` | Status of that run |
| `status` | OK / WARNING |

#### `control.month_end_close`

| Field | Description |
|-------|-------------|
| `latest_run_status` | DRY_RUN / EXECUTED / BLOCKED |
| `latest_run_at` | Timestamp |
| `is_dry_run` | Whether the latest run was a dry run |
| `blocking_check_count` | BLOCKING checks that failed |
| `status` | OK / INFO / CRITICAL |

**Status rules:**
- `blocking_check_count > 0` → CRITICAL
- `latest_run_status == BLOCKED` → CRITICAL
- No run recorded → INFO (not OK)

---

### G. Inventory-Finance Posture (`sections.inventory_finance`)

| Field | Description |
|-------|-------------|
| `delivered_without_stock_ledger_count` | Delivered subscriptions in period with no StockLedger movement |
| `direct_sale_without_stock_ledger_count` | Invoiced/delivered direct sales in period with no StockLedger movement |
| `inventory_valuation` | Always deferred (no automated valuation service) |
| `status` | OK / WARNING |

**Status rules:**
- Either count > 0 → WARNING

---

## Action Items

The `action_items` array contains a normalised, sorted list of items requiring operator attention.

Each item has:

```json
{
  "key": "billing.overdue_demands",
  "severity": "WARNING",
  "title": "Overdue Rent/Lease Demands",
  "description": "3 rent/lease demand(s) are marked OVERDUE.",
  "source_area": "billing",
  "count": 3,
  "amount": "15000.00",
  "action_url": "/admin/rent-lease/demands",
  "deferred": false
}
```

Items are sorted CRITICAL → WARNING → INFO.  
Only real, navigable `action_url` values from existing routes are included.

---

## Severity and Status Rules

| Status | Meaning |
|--------|---------|
| `OK` | No blocker or warning in this section |
| `INFO` | A subsystem has no automation yet, or no run has been recorded |
| `WARNING` | Operator attention needed; not a financial close blocker by itself |
| `CRITICAL` | Financial close or accounting integrity blocker |

**Rule:** Never mark an unavailable automation as OK.  
If a subsystem check is not available (missing model, import error), it returns:

```json
{ "status": "INFO", "message": "...", "deferred": true }
```

---

## What Is Read-Only

The following records are **never created or mutated** by this service:

- `AccountingBridgePosting`
- `JournalEntry` / `JournalEntryLine`
- `Payment` / `EMI`
- `ReceiptDocument`
- `BillingInvoice` / `DirectSale`
- `RentLeaseBillingDemand` / `RentLeaseDepositTransaction`
- `MoneyMovement`
- `StockLedger`
- `ReconciliationItem` / `ReconciliationRun`
- `CustomerAdvance`
- `Commission` / `Payout`
- `AccountingPeriod`

---

## What Is Deferred

These items are deferred from P4A and will be addressed in future phases:

| Item | Reason | Target Phase |
|------|--------|--------------|
| Inventory valuation | No automated valuation service yet | P4C |
| Automatic bridge candidate count | Expensive scan, needs pagination | P4B |
| Frontend admin UI | Backend-first; route and layout TBD | P4B |
| GST return posture | GST module not fully wired to posture | P4C |
| Trial balance balance check | Requires journal line aggregation | P4B |
| Payroll bridge posture | Not yet surfaced to intelligence layer | P4C |
| Purchase vendor bridge posture | Same | P4C |

---

## Operator Interpretation

### Healthy State (before month-end close)

```
overall_status: OK
sections:
  collection.status: OK (all payments have receipts)
  billing.status: OK (no overdue demands)
  bridge.status: OK (no DRAFT journal entries)
  reconciliation.status: OK (all items resolved)
  advance_deposit.status: OK (no liability mismatches)
  control.status: OK (no open exceptions, all daily closes done, month-end executed)
  inventory_finance.status: OK (all deliveries have stock ledger entries)
action_items: []
```

### Warning State (operator action needed)

```
overall_status: WARNING
action_items:
  - key: collection.payments_missing_receipt
    severity: WARNING
    count: 5
    action_url: /admin/receipts
  - key: billing.overdue_demands
    severity: WARNING
    count: 2
```

→ Navigate to the `action_url` for each item and resolve before initiating month-end close.

### Critical State (close blocked)

```
overall_status: CRITICAL
action_items:
  - key: control.open_critical_exceptions
    severity: CRITICAL
    count: 1
  - key: month_end.blocking_checks
    severity: CRITICAL
    count: 3
```

→ Resolve all CRITICAL action items before running month-end close.

---

## How This Supports Month-End Close

Month-end close (P2C) requires:
1. All daily closes for the month are EXECUTED → `control.cash_desk.period_dates_missing_close == 0`
2. No open CRITICAL control exceptions → `control.control_exceptions.open_critical_high_count == 0`
3. No bridge postings with DRAFT journal entries → `bridge.total_draft == 0`
4. No unresolved CRITICAL reconciliation items → `reconciliation.critical_unresolved == 0`
5. No customer advance liability mismatches → `advance_deposit.customer_advance.liability_mismatch_count == 0`
6. Month-end readiness run passes → `control.month_end_close.blocking_check_count == 0`

The Financial Intelligence snapshot gives operators a pre-flight view of all six conditions in a single API call.

---

## Future P4B / P4C / P4D Roadmap

| Phase | Additions |
|-------|-----------|
| **P4B** | Admin UI at `/admin/accounting/financial-intelligence`; trial balance check; bridge candidate count with pagination |
| **P4C** | GST return posture; payroll bridge posture; purchase vendor bridge posture; inventory valuation deferred flag |
| **P4D** | Automated close-readiness report PDF export; scheduled pre-close advisory notification |

---

## Permissions

- All endpoints require `IsAuthenticated + IsAdmin`.
- `CASHIER`, `CUSTOMER`, and `PARTNER` roles are blocked (HTTP 403).
- No sensitive customer document content is exposed.
- Private bank/UPI details are summarised as counts and amounts only.

---

## Service Location

| File | Purpose |
|------|---------|
| `backend/accounting/services/financial_intelligence_service.py` | Core read-only service (7 sections + action items) |
| `backend/api/v1/views/admin_financial_intelligence.py` | DRF API views |
| `backend/api/v1/routes/admin_financial_intelligence.py` | URL patterns |
| `backend/tests/accounting/test_financial_intelligence_service.py` | Test suite |
