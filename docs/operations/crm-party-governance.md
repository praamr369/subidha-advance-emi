# CRM and Party Governance

## Purpose

The CRM and party-master layer gives operators one additive continuity surface across:

- leads
- customers
- partners
- vendors
- staff

It is a directory and timeline layer only. It does not replace the underlying source models.

## What the party master owns

- shared `party_no`
- display name and primary contact snapshot
- cross-reference links into source models
- follow-up interactions
- operator reminder linkage
- cross-module timeline aggregation

## What the party master does not own

- customer KYC truth
- subscription or EMI truth
- direct-sale truth
- billing document truth
- accounting truth
- delivery fulfillment truth
- vendor settlement truth
- payroll truth

Those remain in their existing bounded modules.

## Source-role mapping

- `LEAD` -> `subscriptions.PublicLead`
- `CUSTOMER` -> `subscriptions.Customer`
- `PARTNER` -> `accounts.User` with partner role
- `VENDOR` -> `accounting.Vendor`
- `STAFF` -> `accounting.EmployeeProfile`

## Operator workflow

1. Review `/admin/crm` for due follow-ups and recent party activity.
2. Search `/admin/crm/parties` when a person or organization may already exist in another module.
3. Use `/admin/crm/parties/{id}` to review the cross-module timeline before taking action.
4. Record follow-up notes, callbacks, and handoffs in CRM interactions.
5. Continue the real business transaction in the source workflow:
   - `/admin/leads/{id}`
   - `/admin/customers/...`
   - `/admin/billing/direct-sales`
   - `/admin/subscriptions/...`
   - `/admin/accounting/vendors`
   - `/admin/accounting/staff`

## Conversion and handoff rules

- Lead conversion stays explicit and auditable.
- A lead may link to a created customer, direct sale, subscription, or a compatible combination.
- Direct retail sale stays separate from Lucky Plan subscription truth.
- CRM handoff metadata must never mutate billing, inventory, payment, or accounting records silently.

## Reminder rules

- CRM follow-up reminders are operator reminders only.
- They may reuse the reminder engine for scheduling and visibility.
- They do not recalculate due amounts or replace EMI or retail billing reminders.

## Timeline rules

The party timeline may surface:

- leads
- subscriptions
- direct sales
- invoices
- receipts
- deliveries
- support requests
- reminders
- CRM interactions

The timeline is read-through and traceable. Operators must still open the original module to make domain changes.
