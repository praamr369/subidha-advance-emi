# KPI Visibility Consistency

## Active vs History Contract
- KPI values used for active operational decisions must exclude history-only documents.
- History-only rows remain visible in registers and audit/history views.

## Billing and Receipt Rules
- Active Invoice Balance excludes `VOID`, `REVERSED`, `CANCELLED`, `CREDITED_FULLY`, and draft invoices.
- Window Collections exclude void/reversed/cancelled receipts.
- Cash/UPI/Bank split excludes void/reversed/cancelled receipts.

## Dashboard Consistency
- Finance strip, queue rows, and ledger summaries must use the same active filters.
- If historical amounts are shown, they must be explicitly labeled as historical.

## Safety Notes
- No mutation or deletion of financial history rows to satisfy visibility.
- No change to posting, reconciliation, waiver, lucky-draw, or commission semantics.
# KPI Visibility Consistency Rules

## Active vs History
- Active KPI/outstanding surfaces must exclude:
  - VOID receipts from active collection totals
  - VOID/REVERSED/CREDITED_FULLY invoices from active outstanding
  - archived/reversed/returned/cancelled direct sales from active collection and actionable delivery queues
  - cancelled/closed/completed/defaulted/won subscriptions from active batch KPIs
  - cancelled subscription value from active monthly booked value and active contract value
  - cancelled subscription holders from Lucky ID current-assignment displays

## History Preservation
- Historical documents and audit trails remain visible for forensic and compliance needs.
- Reversal center and delivery history views must retain historical rows even when removed from active operational KPIs.
- Batch detail must show cancelled subscriptions in history-only sections without counting them as active.
- Customer list and customer detail must separate active contract value from historical/cancelled contract value.
- Customer direct-sale outstanding must exclude returned/reversed/archived sales from active receivable totals.
- Customer payment widgets must exclude reversed payments from active counts and active collected totals while keeping history rows visible.

## Consistency Principle
- Dashboard active totals and outstanding ledger must use the same operational visibility rules.
- Any new dashboard/report endpoint should reuse existing visibility helpers instead of custom filters.

## Test Expectations
- Add regression tests for:
  - active KPI exclusion rules
  - historical visibility retention
  - parity between dashboard summaries and outstanding ledger visibility
