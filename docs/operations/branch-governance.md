# Branch Governance

This document defines the additive multi-branch control layer for SUBIDHA CORE.

## Scope

Branch control is a shared governance layer across:

- subscriptions
- payment collections
- direct sales
- billing documents and receipts
- finance accounts and books
- stock locations and purchase inward
- workforce and reimbursement payments

It does not replace those modules. It adds operational ownership and reporting context.

## Core masters

### Branch master

Primary routes:

- `/admin/branches`
- `/admin/branch-reporting`

Rules:

- Keep one `primary` branch only.
- Existing single-branch records should backfill or default to the primary branch.
- Branch status controls operational visibility, not historical financial truth.

### Counter / cash desk master

Primary route:

- `/admin/counters`

Rules:

- Each counter belongs to exactly one branch.
- Each counter maps to exactly one active finance account.
- Counter finance account and branch must match.
- Cashier assignment is optional but recommended.

## Operational posture

### Collections

- Admin payment entry may select branch and counter explicitly.
- Cashier collection remains role-safe and defaults from the assigned active counter when available.
- Payment rows keep branch and counter trace metadata for reporting and accounting bridge provenance.

### Direct retail sale

- Direct sale may carry branch and counter context.
- Billing invoice and receipt may inherit that context.
- Inventory and accounting still post only from controlled document posting paths.

### Inventory and warehouse

- Stock locations now support explicit branch ownership.
- Purchase inward may carry branch context directly or inherit from stock location or finance account.
- Branch stock reporting remains derived from stock ledger and location truth.

### Accounting

- Finance accounts may be linked to a branch.
- Branch reporting derives from accounting, billing, payment, inventory, and workforce truth.
- Branch context is trace metadata on bridge-generated journals, not a replacement for source truth.

## Permission posture

- `ADMIN` keeps global visibility.
- Current branch-safe non-admin enforcement is anchored to cashier users through assigned counters and their linked branches.
- This pass does not weaken existing admin or cashier role boundaries.

## Operator sequence

1. Create the primary branch.
2. Create additional branches only when operationally ready.
3. Link stock locations to the correct branch.
4. Link finance accounts to the correct branch.
5. Create counters for live collection desks.
6. Assign cashier users to counters where possible.
7. Use branch reporting to review collections, sales, contracts, overdue EMI, stock, and people costs by branch.

## Guardrails

- Do not edit historical payments, invoices, stock rows, or journal entries to “move” them between branches.
- Use explicit source documents and controlled posting flows.
- If branch context was missing on old single-branch data, use the primary branch backfill instead of manual spreadsheet correction inside the app.
