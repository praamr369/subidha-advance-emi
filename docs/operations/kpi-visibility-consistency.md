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
