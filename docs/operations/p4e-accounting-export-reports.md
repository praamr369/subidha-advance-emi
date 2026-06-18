# P4E — Export-Ready Accounting Reports

## Overview

P4E adds read-only, structured accounting report exports that allow an admin or
accountant to download or inspect neutral accounting outputs for manual review
and import preparation. No external system is written to. No financial records
are created or mutated.

---

## Reports Available

| Report Key | Title | Source |
|---|---|---|
| `trial_balance_export` | Trial Balance Export | P4B trial balance check service |
| `journal_export` | Journal Register Export | JournalEntry / JournalEntryLine models |
| `ledger_export` | Account Ledger Summary Export | reporting_service.build_trial_balance |
| `receivables_export` | Receivables Export | BillingInvoice + RentLeaseBillingDemand |
| `liability_export` | Liability Reconciliation Export | P4C liability reconciliation service |
| `bridge_audit_export` | Bridge Audit Export | AccountingBridgePosting model |

---

## API Endpoints

All endpoints are admin-only (`GET`, no mutations).

```
GET /api/v1/admin/accounting/exports/
GET /api/v1/admin/accounting/exports/trial-balance/
GET /api/v1/admin/accounting/exports/journals/
GET /api/v1/admin/accounting/exports/ledgers/
GET /api/v1/admin/accounting/exports/receivables/
GET /api/v1/admin/accounting/exports/liabilities/
GET /api/v1/admin/accounting/exports/bridge-audit/
```

### Common Query Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `year` | int | current year | Accounting period year |
| `month` | int | current month | Accounting period month (1–12) |
| `as_of` | YYYY-MM-DD | today | Diagnostic reference date |
| `format` | json\|csv | json | Response format |

### journals-only Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `include_draft` | true\|false | false | Include DRAFT journal entries |
| `limit` | int | 500 (max 2000) | Max journal lines to return |

### bridge-audit-only Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 1000 (max 5000) | Max bridge audit rows to return |

---

## Response Envelope

Every report endpoint (JSON format) returns:

```json
{
  "report_key": "trial_balance_export",
  "period": { "year": 2026, "month": 6 },
  "as_of": "2026-06-18",
  "columns": ["account_code", "account_name", ...],
  "rows": [ { "account_code": "101", ... }, ... ],
  "totals": { "total_debit": "50000.00", "is_balanced": true },
  "warnings": [],
  "metadata": {
    "generated_at": "2026-06-18T12:00:00Z",
    "read_only": true,
    "source": "P4B trial_balance_check_service"
  }
}
```

---

## Report Details

### A. Trial Balance Export

- Source: P4B `build_trial_balance_check`
- POSTED journal entries only; VOID and DRAFT excluded
- Opening balance is **deferred** (shown as 0) — see Limitations
- Columns: `account_code`, `account_name`, `account_type`, `is_active`,
  `normal_balance`, `period_debit`, `period_credit`, `net_balance`, `row_status`
- `totals.is_balanced` = true when debit equals credit
- Warnings emitted if trial balance is unbalanced or P4B checks flag WARNING/CRITICAL

### B. Journal Register Export

- POSTED entries by default; VOID always excluded
- Set `include_draft=true` to include DRAFT entries (warning added to payload)
- One row per `JournalEntryLine`, repeated journal header fields per row
- Default limit: 500 lines. Max: 2000. Use a narrower period for large datasets.
- `totals.truncated=true` when limit was hit

### C. Account Ledger Summary Export

- One row per chart account active in the period
- Columns: `account_code`, `account_name`, `account_type`, `opening_balance`,
  `period_debit`, `period_credit`, `closing_balance`, `balance_side`
- Opening balance is always 0 (deferred — see Limitations)
- Line-level per-account transaction detail is deferred; use the account ledger
  endpoint for per-account detail
- Source: `reporting_service.build_trial_balance`

### D. Receivables Export

- Posted `BillingInvoice` rows with `balance_total > 0` dated within the period
- `RentLeaseBillingDemand` rows with status PENDING/PARTIAL/OVERDUE due within the period
- Columns: `source`, `document_no`, `date`, `demand_type`, `grand_total`,
  `received_total`, `outstanding`, `status`
- Customer phone, address, and KYC data are **not included**
- `totals.invoice_outstanding`, `totals.rent_lease_outstanding`, `totals.total_outstanding`

### E. Liability Reconciliation Export

- Source: P4C `build_liability_reconciliation_snapshot`
- Returns flat metric rows for customer advance and security deposit liabilities
- Columns: `liability_type`, `metric`, `value`, `status`, `notes`
- GL account balance comparison is deferred (requires mapped chart accounts)
- Warnings from P4C checks (WARNING/CRITICAL) are surfaced in the export envelope

### F. Bridge Audit Export

- `AccountingBridgePosting` rows for the period
- Filtered by `source_event_date` in period; rows with null `source_event_date`
  fall back to `created_at` for period scoping
- Columns: `purpose`, `source_model`, `source_id`, `source_reference`,
  `source_document_no`, `voucher_type`, `source_type`, `source_event_date`,
  `journal_entry_no`, `journal_entry_status`, `journal_entry_date`
- `totals.by_purpose` shows per-purpose row counts
- Default limit: 1000. Max: 5000.

---

## JSON vs CSV Behaviour

- `format=json` (default) returns a structured JSON response via the DRF `Response`
- `format=csv` returns `text/csv` with `Content-Disposition: attachment`
- CSV uses the `columns` list as headers; each `rows` entry is a CSV row
- CSV does not include `totals`, `warnings`, or `metadata`
- `format=xlsx` is not supported and returns HTTP 400

---

## Frontend Page

Route: `/admin/accounting/exports/reports`

- Period selector (year/month dropdowns)
- One card per available report
- "View JSON" button: fetches and previews the first 3 rows inline
- "Download CSV" button: authenticated download via `downloadAuthenticatedFile`
- Loading, error, and empty states for each card
- No disabled buttons or fake reports

---

## Export Limitations

1. **Opening balance deferred** — Trial balance and ledger exports show opening
   balance as 0. Full opening balance automation (P4B-OB-001) is pending. Exports
   correctly reflect period-only activity.

2. **Ledger line detail deferred** — The ledger export is account-level summary
   only. Per-account transaction detail is available via the existing account
   ledger endpoint but is not bundled into the aggregate ledger export.

3. **Receivables are period-scoped** — The receivables export filters by
   `invoice_date` / `due_date` within the selected period. Overdue items from
   prior periods are not included unless their due date falls in the period.

4. **GL comparison for liabilities deferred** — The liability export shows
   expected liability from source models (CustomerAdvance, RentLeaseDepositTransaction).
   Comparison against GL account balances is deferred pending chart account mapping.

5. **Bridge rows without source_event_date** — Rows with null `source_event_date`
   use `created_at` as a fallback for period scoping.

---

## Why Direct Tally/Zoho Sync is Deferred

Direct sync to Tally or Zoho requires:

- Tally XML/ODBC adapter or REST credentials stored as secrets
- Per-ledger mapping from SUBIDHA chart accounts to Tally/Zoho account codes
- Idempotent sync mechanism to avoid duplicate vouchers on retry
- Error handling for connectivity failures mid-sync

These are deliberately deferred. The JSON/CSV exports produced by P4E are
designed as a neutral handoff format that an accountant can manually import into
Tally, Zoho, or any other tool. This keeps the core system free of external
credentials and avoids mutation risk from failed sync attempts.

---

## How an Accountant Should Use These Exports

1. Navigate to **Admin → Accounting → Exports → Reports**
2. Select the accounting year and month
3. Click **View JSON** to preview a report inline
4. Click **Download CSV** to save a CSV file
5. Import the CSV into Tally/Zoho manually using their import tool
6. Verify the `totals.is_balanced` flag on the Trial Balance export before closing

---

## Privacy Notes

- Receivables export excludes customer phone, address, and KYC documents
- Bridge audit export exposes `source_model` and `source_id` which are internal
  reference keys, not customer-facing identifiers
- Cashier, customer, partner, and unauthenticated requests are blocked (HTTP 403/401)

---

## Future External Integration Roadmap

| Phase | Capability |
|---|---|
| P4E (current) | JSON/CSV neutral exports for manual import |
| P5 (deferred) | Tally XML voucher generation (no direct push) |
| P6 (deferred) | Zoho Books API sync with idempotency guard |
| P7 (deferred) | Automated reconciliation post-sync |

---

## Data Sources

| Report | Primary Model(s) |
|---|---|
| Trial Balance | JournalEntryLine (via P4B) |
| Journal Register | JournalEntry, JournalEntryLine |
| Ledger Summary | JournalEntryLine (via reporting_service) |
| Receivables | BillingInvoice, RentLeaseBillingDemand |
| Liability | CustomerAdvance, RentLeaseDepositTransaction (via P4C) |
| Bridge Audit | AccountingBridgePosting |

No records in any of these tables are created or mutated during export generation.
