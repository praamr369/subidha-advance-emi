# Operational Dashboard Visibility

Dashboard and navigation badges must represent active operational workload only.

## Rules

- Exclude cancelled/void/reversed/archived lifecycle records from active counts.
- Keep historical and audit pages fully visible for cancelled/void/reversed documents.
- Keep role boundaries strict:
  - admin-only badge surfaces remain admin-only
  - customer dashboard is customer-scoped
  - partner dashboard is partner-scoped
  - cashier dashboard remains collection-focused

## Non-goals

- No mutation of EMI calculation.
- No mutation of payment posting.
- No mutation of reconciliation, waiver, draw, commission, payout, journal, stock ledger, return/refund/reversal posting flows.
