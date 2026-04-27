# Roles and Permissions (Operational Matrix)

## Admin

- Full access to:
  - accounting control center
  - operations command center
  - global BI/reports
  - reconciliation actions
  - exports

## Cashier

- Allowed:
  - collection/payment posting flows already designated for cashier
  - cashier payment history
- Not allowed:
  - global accounting control center
  - global BI/reports
  - contract financial-term edits

## Partner

- Allowed:
  - partner scoped customers/subscriptions/collections/finance pages
- Not allowed:
  - unrelated customer/contract data
  - global accounting/reconciliation data
  - global admin reports

## Customer

- Allowed:
  - own dashboard, invoices, receipts, payments, support, delivery/documents
- Not allowed:
  - other customers' records
  - admin/partner/cashier routes

## Public Visitor

- Allowed:
  - public product info, lead/application flows
- Not allowed:
  - protected APIs or authenticated dashboards

## Security Assertions (Must Pass Before Go-Live)

- customer A cannot fetch customer B data
- partner cannot fetch unrelated customer data
- cashier cannot alter terms/waivers or admin reports
- public requests to protected endpoints are blocked
- document/PDF download permissions respect ownership/scope
