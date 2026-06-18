# P4B — Trial Balance Automation Check

## Overview

P4B adds a read-only Trial Balance Automation Check layer that computes debit/credit totals by account for a selected period, detects data-quality risks, and integrates the result into the P4A Financial Intelligence snapshot.

No financial records are mutated. No `AccountingBridgePosting`, `JournalEntry`, `JournalLine`, `Payment`, `EMI`, `StockLedger`, `BillingInvoice`, `ReceiptDocument`, `Commission`, `Payout`, `Reconciliation`, or `MoneyMovement` rows are created or modified by any P4B function.

---

## Calculation Method

### Source data

Only `JournalEntryLine` rows linked to `JournalEntry` records with `status = POSTED` are included in debit/credit totals.

DRAFT and VOID entries are **excluded from all totals** by design.

### Period resolution

The period is resolved in this priority:

1. Explicit `year` + `month` query params → full calendar month (`YYYY-MM-01` to `YYYY-MM-last`).
2. `as_of` date → year/month derived from `as_of`.
3. Neither → today's year/month.

### Per-account rows

Each row aggregates `debit_amount` and `credit_amount` across all POSTED lines in the period for that `ChartOfAccount`. Normal balance direction is derived from `account_type`:

| account_type | Normal balance |
|---|---|
| ASSET | DR (debit) |
| EXPENSE | DR (debit) |
| LIABILITY | CR (credit) |
| EQUITY | CR (credit) |
| INCOME | CR (credit) |

`net_balance` is computed as:

- For DR-normal accounts: `closing_debit − closing_credit`
- For CR-normal accounts: `closing_credit − closing_debit`

A negative `net_balance` relative to the normal direction triggers a row-level `WARNING`.

### Opening balance

Opening balance automation is **not available yet** (deferred item P4B-OB-001). Opening columns (`opening_debit`, `opening_credit`) are returned as `"0.00"` on every row, with `metadata.opening_balance_deferred = true` and an `INFO` check.

**Do not interpret opening columns as actual historical balances.** The closing columns (`closing_debit`, `closing_credit`) reflect only the period's activity from POSTED entries.

---

## Journal Status Inclusion / Exclusion

| Status | Included in totals | Check produced |
|---|---|---|
| POSTED | Yes | — |
| DRAFT | No | WARNING: count of draft journals in period |
| VOID | No | INFO: count of voided journals in period |

---

## Status Rules

The overall `status` field on the check payload is the worst of all individual check statuses.

| Check | Trigger | Status |
|---|---|---|
| `balance.debit_equals_credit` | total_debit ≠ total_credit | CRITICAL |
| `journal.posted_no_lines` | any posted journal has 0 lines | CRITICAL |
| `line.both_sides_nonzero` | any posted line has debit > 0 AND credit > 0 | CRITICAL |
| `line.neither_side_nonzero` | any posted line has debit = 0 AND credit = 0 | CRITICAL |
| `journal.draft_in_period` | draft journals exist in period | WARNING |
| `line.inactive_account` | posted lines reference inactive accounts | WARNING |
| `period.closed` | accounting period is CLOSED | WARNING |
| `period.locked` | accounting period is LOCKED | INFO |
| `period.open` | accounting period is OPEN | OK |
| `period.no_period_defined` | no accounting period covers this range | INFO |
| `opening_balance.deferred` | always (automation not available) | INFO |
| `journal.voided_in_period` | voided journals exist in period | INFO |

Row-level status:

| Condition | Row status |
|---|---|
| Account has DR normal balance but net < 0 | WARNING |
| Account has CR normal balance but net < 0 | WARNING |
| Account is inactive but has period activity | WARNING |
| Otherwise | OK |

---

## Known Deferred Limitations

**P4B-OB-001 — Opening balance automation**: Opening balance columns (`opening_debit`, `opening_credit`) are always `"0.00"`. Closing columns reflect only the current period's POSTED activity. A future phase will compute true opening balances by summing all POSTED lines before the period start date. Until then, the `opening_balance.deferred` check always returns `INFO`, never `OK`.

This means:

- `closing_debit` = period debit (not cumulative)
- `closing_credit` = period credit (not cumulative)
- `net_balance` reflects only the selected period, not the account's lifetime balance

---

## P4A Integration

P4B adds a `trial_balance` section to the P4A Financial Intelligence snapshot (`sections.trial_balance`). This section includes:

```json
{
  "status": "OK | INFO | WARNING | CRITICAL",
  "is_balanced": true,
  "total_debit": "1500.00",
  "total_credit": "1500.00",
  "difference": "0.00",
  "critical_check_count": 0,
  "action_item": null
}
```

If `is_balanced = false`, an `action_item` is included with `severity = CRITICAL`.

The `trial_balance` section status rolls into P4A's `overall_status` alongside all other sections. A failing trial balance will raise the overall snapshot to CRITICAL.

---

## API

### Endpoint

```
GET /api/v1/admin/financial-intelligence/trial-balance/
```

**Authentication**: Admin only (`IsAuthenticated + IsAdmin`). Cashier, customer, partner, and unauthenticated requests return 403/401.

### Query Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `as_of` | YYYY-MM-DD | today | Sets the reference date. Period defaults to as_of's year/month. |
| `year` | integer | as_of year | Override year for period. |
| `month` | integer | as_of month | Override month for period (1–12). |

### Response Shape

```json
{
  "as_of": "2026-06-18",
  "period": {"year": 2026, "month": 6},
  "period_start": "2026-06-01",
  "period_end": "2026-06-30",
  "total_debit": "1500.00",
  "total_credit": "1500.00",
  "difference": "0.00",
  "is_balanced": true,
  "status": "INFO",
  "critical_check_count": 0,
  "rows": [
    {
      "account_id": 42,
      "account_code": "1001",
      "account_name": "Cash",
      "account_type": "ASSET",
      "is_active": true,
      "normal_balance": "DR",
      "opening_debit": "0.00",
      "opening_credit": "0.00",
      "period_debit": "1500.00",
      "period_credit": "0.00",
      "closing_debit": "1500.00",
      "closing_credit": "0.00",
      "net_balance": "1500.00",
      "status": "OK",
      "metadata": {
        "opening_balance_deferred": true,
        "opening_balance_message": "Opening balance automation not available yet (P4B-OB-001)."
      }
    }
  ],
  "checks": [
    {
      "key": "balance.debit_equals_credit",
      "label": "Debit equals Credit",
      "status": "OK",
      "count": 0,
      "message": "Total debits equal total credits.",
      "metadata": {
        "total_debit": "1500.00",
        "total_credit": "1500.00",
        "difference": "0.00"
      }
    }
  ],
  "action_items": [
    {
      "key": "trial_balance.opening_balance_deferred",
      "severity": "INFO",
      "title": "Opening Balance Automation Not Available",
      "description": "Opening balance columns show 0. Full opening balance computation is deferred to P4B-OB-001.",
      "source_area": "trial_balance",
      "count": 0,
      "deferred": true
    }
  ]
}
```

---

## Operator Interpretation Before Month-End Close

Before executing month-end close, operators should check the trial balance for:

1. **`is_balanced = false`** (CRITICAL): Do not proceed. Investigate unbalanced journals.
2. **`journal.draft_in_period` count > 0** (WARNING): Post or void all drafts before closing.
3. **`journal.posted_no_lines` count > 0** (CRITICAL): Data integrity issue. Investigate and contact support.
4. **`line.both_sides_nonzero` count > 0** (CRITICAL): Constraint violation. Investigate immediately.
5. **`period.closed`** (WARNING): Period is already closed; new postings are blocked.
6. **`line.inactive_account` count > 0** (WARNING): Review mapping; inactive accounts should not receive new postings.
7. **Opening balance columns**: Ignore `opening_debit`/`opening_credit` until P4B-OB-001 is resolved. Use the existing `GET /api/v1/accounting/reports/trial-balance/` report for historical context if needed.

---

## Future Steps

- **P4B-OB-001**: Compute true opening balances by summing all POSTED lines prior to the period start date.
- **UI**: Trial Balance Check panel on the Financial Intelligence admin page, with per-account drill-down.
- **Export**: CSV/XLSX export of trial balance rows for auditor handover.
- **Scheduled alert**: Automated CRITICAL alert if `is_balanced = false` at period-end.
- **Rent/lease compatibility**: P4B reads only from `JournalEntryLine` and `ChartOfAccount`; it is fully compatible with any future rent/lease journal postings that follow the existing model conventions.

---

## Related

- P4A: `docs/operations/p4a-financial-intelligence-readiness.md`
- Existing trial balance report (simple, date-range, no quality checks): `GET /api/v1/accounting/reports/trial-balance/`
- Month-end close: `docs/operations/month-end-close.md`
