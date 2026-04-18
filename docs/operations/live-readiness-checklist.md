# Live Readiness Checklist (Go‑Live Gate)

SUBIDHA CORE computes a **go-live readiness checklist** from real stored data. This is used to:
- make “first run” setup explicit and repeatable
- avoid starting live collections with missing operational masters
- stay backward compatible (no hard blocking of harmless browsing)

UI:
- `/admin/settings/business-setup/checklist`

## Required (go-live blockers)

These items must be complete before live onboarding/collections:

1) Business profile configured
- includes legal name + contact defaults for customer documents

2) Primary branch configured
- at least one active branch
- exactly one branch marked primary

3) Collection counter available
- at least one active counter mapped to a finance account

4) Chart of accounts configured
- at least one active chart account

5) Finance accounts configured
- at least one CASH finance account
- at least one BANK or UPI finance account

6) Products added
- at least one product before onboarding subscriptions/customers

## Recommended (strongly suggested)

These improve auditability and day-to-day operations:

- Accounting periods configured (clean reporting and posting windows)
- Invoice/receipt number series configured (document sequences)
- At least one CASHIER user created for collections
- At least one batch created before Lucky Plan onboarding

## Optional (module-dependent)

Only configure these if you use the module:

- Inventory locations + inventory items configured (stock movement, delivery bridging)
- Partner user readiness (only if partner collections/commissions are part of your workflow)

## Why this is financially safe

- Checklist reads existing tables and counts only; it does not mutate money logic.
- Reset uses a controlled plan and explicit confirmation; it does not rewrite EMI history or financial semantics.
- Accounting setup is kept separate from EMI payment ledger behavior.

