# P4C — Customer Advance and Security Deposit Liability Reconciliation Center

**Phase:** P4C  
**Status:** Backend complete. Frontend deferred.  
**Service:** `backend/accounting/services/liability_reconciliation_service.py`  
**API:** `GET /api/v1/admin/financial-intelligence/liability-reconciliation/`  
**Permission:** Admin only.

---

## Overview

P4C provides a read-only diagnostic center for two liability subsystems:

1. **Customer Advances** — cash collected from customers before EMI/sale application.
2. **Rent/Lease Security Deposits** — deposits held as liability until refunded or deducted.

Both subsystems represent balance-sheet liabilities. P4C surfaces mismatches, bridge gaps, and month-end close blockers so admin can investigate before period close, without mutating any financial record.

---

## What Is Read-Only

**The service never:**
- Creates or updates `CustomerAdvance`, `CustomerAdvanceAllocation`, or `CustomerAdvanceRefund` rows.
- Creates or updates `RentLeaseDepositTransaction` or `RentLeaseBillingDemand` rows.
- Creates or updates `AccountingBridgePosting`, `JournalEntry`, or `JournalLine` rows.
- Creates or updates `Payment`, `EMI`, `Subscription`, `StockLedger`, `BillingInvoice`, `ReceiptDocument`, `DirectSale`, `Commission`, `Payout`, `Reconciliation`, or `MoneyMovement` rows.
- Posts missing bridge entries automatically.
- Auto-fixes reconciliation gaps.

---

## Customer Advance Liability Formula

```
expected_liability = total_advance_collected
                   − total_advance_applied
                   − total_advance_refunded
```

Where:
- `total_advance_collected` = `SUM(CustomerAdvance.amount)` across all records.
- `total_advance_applied` = `SUM(CustomerAdvanceAllocation.amount)` across all allocations.
- `total_advance_refunded` = `SUM(CustomerAdvanceRefund.amount)` where `status = ACTIVE`.

The `expected_liability` should equal `SUM(CustomerAdvance.unapplied_amount)` (`unapplied_balance`). Any non-zero `difference` indicates a data inconsistency.

**Status inconsistencies counted in `mismatch_count`:**
- `FULLY_APPLIED` advance with `unapplied_amount > 0`.
- `UNAPPLIED` advance with `unapplied_amount == 0`.

---

## Security Deposit Liability Formula

```
expected_deposit_liability = total_deposit_collected
                           − total_deposit_refunded
                           − total_deposit_deducted
```

Where:
- `total_deposit_collected` = SUM of `COLLECTED` and `DEPOSIT_RECEIPT` transactions (non-voided/reversed).
- `total_deposit_refunded` = SUM of `REFUNDED` and `DEPOSIT_REFUND` transactions (non-voided/reversed).
- `total_deposit_deducted` = SUM of `DEDUCTION` transactions (non-voided/reversed — damage recovery from P1).

`VOIDED` and `REVERSED` transactions are always excluded from totals.

---

## Bridge Gap Detection Rules

Bridge gaps are detected by comparing source record IDs against `AccountingBridgePosting` rows.

### Customer Advance Bridge Purposes

| Source Model              | Purpose                       | Event                        |
|---------------------------|-------------------------------|------------------------------|
| `CustomerAdvance`         | `CUSTOMER_ADVANCE_RECEIPT`    | Cash collected from customer |
| `CustomerAdvanceAllocation` | `CUSTOMER_ADVANCE_APPLICATION` | Advance applied to EMI/sub |
| `CustomerAdvanceRefund`   | `CUSTOMER_ADVANCE_REFUND`     | Advance refunded to customer |

### Security Deposit Bridge Purposes

| Transaction Type | Bridge Purposes                                                                 |
|------------------|---------------------------------------------------------------------------------|
| COLLECTED / DEPOSIT_RECEIPT | `SECURITY_DEPOSIT_RECEIPT`, `RENT_SECURITY_DEPOSIT_RECEIPT`, `LEASE_SECURITY_DEPOSIT_RECEIPT` |
| REFUNDED / DEPOSIT_REFUND   | `SECURITY_DEPOSIT_REFUND`, `RENT_SECURITY_DEPOSIT_REFUND`, `LEASE_SECURITY_DEPOSIT_REFUND`   |
| DEDUCTION        | Purpose contains `DAMAGE` (P1 damage recovery posture)                           |

**Scan cap:** Bridge gap scans are capped at 5,000 records to prevent full-table scans on large deployments. Reported gaps are approximate when the dataset exceeds the cap.

---

## Check Keys and Statuses

| Check Key | Status Meaning |
|-----------|----------------|
| `customer_advance_source_available` | OK if `CustomerAdvance` model importable; INFO/deferred otherwise. |
| `customer_advance_liability_mismatch` | OK if expected_liability == unapplied_balance and no status inconsistencies; WARNING if difference is small; CRITICAL if difference > ₹1,000. |
| `customer_advance_bridge_gap` | OK if no gaps; WARNING if any receipt/application/refund source has no bridge posting. |
| `stale_unresolved_liability_items` | OK if no UNAPPLIED/PARTIALLY_APPLIED advances older than 90 days; WARNING if any found. |
| `security_deposit_source_available` | OK if `RentLeaseDepositTransaction` model importable; INFO/deferred otherwise. |
| `security_deposit_liability_mismatch` | Deferred — GL liability account mapping is required for automated comparison. |
| `security_deposit_collection_bridge_gap` | OK / WARNING based on collection bridge coverage. |
| `security_deposit_refund_bridge_gap` | OK / WARNING based on refund bridge coverage. |
| `security_deposit_deduction_bridge_gap` | OK / WARNING based on deduction/damage bridge coverage. |
| `active_rent_lease_without_deposit_posture` | OK if all ACTIVE RENT/LEASE subscriptions have at least one collection record; WARNING otherwise. |

### Severity Mapping

| Status | Severity | Meaning |
|--------|----------|---------|
| OK | — | No issue detected. |
| INFO | INFO | Deferred check — automation not available. |
| WARNING | WARNING | Issue detected; admin review required before close. |
| CRITICAL | CRITICAL | Significant financial discrepancy; close blocker. |

---

## What Is Deferred

- **`posted_liability_balance`** (both advance and deposit): Comparing expected liability against the actual GL balance requires knowing which chart-of-accounts code holds the liability. This requires manual configuration per deployment and is not auto-detected. Returns `null`.

- **`posted_deposit_liability_balance`**: Same as above for deposits.

- **`security_deposit_liability_mismatch`** full check: deferred until GL mapping is configured.

Deferred checks return `"status": "INFO"`, `"deferred": true`, and do not affect `overall_status` adversely.

---

## API Contract

### Endpoint

```
GET /api/v1/admin/financial-intelligence/liability-reconciliation/
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `as_of` | YYYY-MM-DD | Optional. Date context for the snapshot. Defaults to today. |
| `year` | integer | Optional. Period year. Defaults to `as_of` year. |
| `month` | integer | Optional. Period month (1–12). Defaults to `as_of` month. |

### Response Shape

```json
{
  "as_of": "2026-06-18",
  "period": {"year": 2026, "month": 6},
  "overall_status": "OK|INFO|WARNING|CRITICAL",
  "customer_advance": {
    "status": "...",
    "source_available": true,
    "total_advance_collected": "12000.00",
    "total_advance_applied": "5000.00",
    "total_advance_refunded": "1000.00",
    "expected_liability": "6000.00",
    "unapplied_balance": "6000.00",
    "posted_liability_balance": null,
    "difference": "0.00",
    "mismatch_count": 0,
    "bridge_gap_count": 0,
    "stale_unapplied_count": 0,
    "checks": [...],
    "metadata": {...}
  },
  "security_deposit": {
    "status": "...",
    "source_available": true,
    "total_deposit_collected": "50000.00",
    "total_deposit_refunded": "10000.00",
    "total_deposit_deducted": "2000.00",
    "expected_deposit_liability": "38000.00",
    "posted_deposit_liability_balance": null,
    "unposted_collection_count": 0,
    "unposted_refund_count": 0,
    "unposted_deduction_count": 0,
    "active_contract_deposit_gap_count": 0,
    "mismatch_count": 0,
    "checks": [...],
    "metadata": {...}
  },
  "checks": [...],
  "action_items": [...]
}
```

### Check Object Shape

```json
{
  "key": "customer_advance_bridge_gap",
  "status": "WARNING",
  "severity": "WARNING",
  "title": "Customer Advance Bridge Posting Gaps",
  "message": "3 customer advance source record(s) are missing accounting bridge postings.",
  "count": 3,
  "amount": "1500.00",
  "source_area": "customer_advance",
  "action_url": "/admin/accounting/bridge-reconciliation",
  "deferred": false,
  "metadata": {"receipt_gap": 2, "application_gap": 1, "refund_gap": 0, "cap": 5000}
}
```

### Permissions

| Role | Access |
|------|--------|
| Admin | Allowed |
| Cashier | Blocked (403) |
| Customer | Blocked (403) |
| Partner | Blocked (403) |
| Unauthenticated | Blocked (401/403) |

---

## Relation to P4A Financial Intelligence

P4C is integrated into P4A (`financial_intelligence_service.py`) additively:

- The `sections.advance_deposit.customer_advance` section in P4A gains three new fields:
  - `expected_liability`
  - `bridge_gap_count`
  - `stale_unapplied_count`
  - `p4c_status`

- The `sections.advance_deposit.security_deposit` section gains:
  - `expected_deposit_liability`
  - `active_contract_deposit_gap_count`
  - `p4c_status`

- P4C action items are merged into `build_financial_action_items()` under keys:
  - `liability.customer_advance_mismatch`
  - `liability.customer_advance_bridge_gap`
  - `liability.stale_unapplied_advances`
  - `liability.deposit_bridge_gaps`
  - `liability.active_contracts_without_deposit`

The existing P4A response shape is not broken. All new fields are additive.

---

## Relation to Month-End Close

The month-end close service (`control_month_end_close_service.py`) has two existing checks:

| Check Key | Behaviour |
|-----------|-----------|
| `customer_advance_clean` | WARNING if any UNAPPLIED advance exists on or before period end. |
| `security_deposit_reconciliation` | WARNING if any `REFUND_APPROVED` deposit is still ACTIVE on or before period end. |

P4C does not change these existing checks. It provides a deeper diagnostic layer accessible before running month-end close. When P4C detects issues (bridge gaps, liability mismatches), admin should resolve them before executing the month-end close.

---

## Future Work

1. **GL balance comparison**: Once chart-of-accounts mapping for the customer advance liability account and security deposit liability account is configured per deployment, P4C can compare `expected_liability` against `posted_liability_balance` from the ledger. This will enable CRITICAL alerting for GL/subsidiary ledger divergence.

2. **Export**: CSV export of unposted transactions and bridge gap lists for finance team review.

3. **Frontend panel**: A dedicated reconciliation panel in the accounting admin UI showing both subsystems side-by-side with drill-down into individual records.

4. **Pagination for large datasets**: Replace the bridge scan cap with cursor-based pagination when datasets exceed 5,000 records.

5. **CustomerAdvanceAllocation bridge coverage**: Currently included in bridge gap count; future work can surface allocation-level detail in the UI.

---

## Data Integrity Guarantees

- No financial record is ever created or mutated by any function in this module.
- The service is idempotent: calling it multiple times produces the same result without side effects.
- All sub-checks are wrapped defensively: a single subsystem failure never crashes the full snapshot.
- Deferred checks return `INFO` status, not `OK`, so they do not mask real issues.
