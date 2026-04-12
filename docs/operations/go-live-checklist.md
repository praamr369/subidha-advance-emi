# Go-Live Checklist

This is the final operator-facing go-live checklist for SUBIDHA CORE after the additive ERP, inventory, billing, accounting, CRM, service-desk, manufacturing, payroll, and branch-control passes.

## 1. Confirm the environment

- Production secrets are loaded from ops-managed storage.
- Database backup or snapshot is complete.
- The exact migration plan is approved.
- Branch, counter, finance-account, and cashier assignments are signed off.

## 2. Configure before importing

1. Create internal admin and cashier users.
2. Load branch masters.
3. Load counter masters.
4. Confirm finance-account mapping for every counter.
5. Confirm stock locations and branch ownership.

## 3. Import in the safe order

1. Products
2. Vendors
3. Staff
4. Opening stock
5. Customers
6. Batches
7. Lucky ID validation
8. Subscriptions through controlled create flow only

For every supported import:

- Validate first.
- Preview first.
- Post only with zero invalid rows.
- Review the result summary immediately.

## 4. Workflow continuity checks

- CRM to sale/EMI:
  lead handoff reaches direct sale or subscription creation without silent conversion.
- Procurement to stock to manufacturing:
  purchase inward, stock visibility, BOM/job visibility, and FG receipt all align.
- Sale/subscription to billing to payment to accounting:
  invoices, receipts, payments, and bridge-posted books remain source-traceable.
- Returns/service to notes to stock/accounting:
  service desk cases can be reviewed without direct invoice, stock, or journal edits.
- Salary, expense, vendor, and reimbursement flows:
  operational documents exist before accounting mirrors them.
- Branch/counter to reporting:
  cashier collections and branch summaries resolve to the intended branch.

## 5. Live counter cutover rules

- Do not open a cashier counter until it is linked to one branch and one active finance account.
- Do not use unassigned cashier users in real multi-branch mode.
- Do not collect live payments until one branch/counter test collection is verified end to end.

## 6. Sign-off before opening business

- One direct sale draft/invoice/receipt flow is checked.
- One EMI subscription/payment/receipt flow is checked.
- One inventory stock ledger drill-down is checked.
- One branch reporting overview is checked.
- One trial balance, one cash/bank/UPI book, and one branch-safe report are checked.
- Operator team has the first-week, branch-close, counter-close, and rollback runbooks.
