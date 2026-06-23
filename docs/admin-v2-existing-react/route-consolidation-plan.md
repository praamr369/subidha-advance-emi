# Route Consolidation Plan

## Current strategy

Phase 1 changes navigation, not route ownership.

- the sidebar shows eight workbench entries
- current module pages remain available
- workbench tabs hand off to current routes
- global search and command palette retain access to the full admin route
  inventory

## Query-state pattern

Use:

- `/admin/customer-360?tab=customers&customerId=123`
- `/admin/revenue?tab=payments&paymentId=55`
- `/admin/revenue?tab=subscriptions&subscriptionId=22`
- `/admin/inventory-fulfillment?tab=products&productId=88`
- `/admin/finance-control?tab=reconciliation&runId=7`

Do not add new action routes when a drawer, selected row, filter, or query
parameter is sufficient.

## Legacy route handling

Legacy routes remain direct links during consolidation. Do not delete or
redirect them until:

- the workbench owns the complete workflow
- bookmarked and printed routes are accounted for
- role and permission checks are equivalent
- one release cycle has completed without fallback use

## Duplicate labels hidden from the new sidebar

- legacy dashboard
- ERP
- workspace
- delivery
- service
- partner
- lucky draw
- EMI
- overdue EMI
- reports
- misspelled commission aliases

These paths may remain compatibility routes even when hidden from navigation.
