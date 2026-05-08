# KPI Visibility Consistency Rules

## Active vs History
- Active KPI/outstanding surfaces must exclude:
  - VOID receipts from active collection totals
  - VOID/REVERSED/CREDITED_FULLY invoices from active outstanding
  - archived/reversed/returned/cancelled direct sales from active collection and actionable delivery queues

## History Preservation
- Historical documents and audit trails remain visible for forensic and compliance needs.
- Reversal center and delivery history views must retain historical rows even when removed from active operational KPIs.

## Consistency Principle
- Dashboard active totals and outstanding ledger must use the same operational visibility rules.
- Any new dashboard/report endpoint should reuse existing visibility helpers instead of custom filters.

## Test Expectations
- Add regression tests for:
  - active KPI exclusion rules
  - historical visibility retention
  - parity between dashboard summaries and outstanding ledger visibility
