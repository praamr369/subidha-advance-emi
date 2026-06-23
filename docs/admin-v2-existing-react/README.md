# Admin V2 in Existing React

Admin V2 continues inside the existing `frontend/` Next.js application.

## Decision

- Next.js App Router remains the frontend architecture.
- React, TypeScript, Tailwind, TanStack Query, route checks, and existing API
  clients remain in use.
- the separate `admin-vite/` application and its migration documents are
  removed
- public, admin, cashier, staff, customer, partner, and vendor users remain in
  the same Next.js application

## Workbench routes

- `/admin`
- `/admin/customer-360`
- `/admin/revenue`
- `/admin/inventory-fulfillment`
- `/admin/finance-control`
- `/admin/crm-partners`
- `/admin/operations-people`
- `/admin/reports-setup`

The admin sidebar shows these eight entries. Existing module routes remain
available through workbench tabs, global search, command palette, bookmarks,
and direct links.

## Safety boundary

- Django APIs remain the source of truth.
- no business logic or database schema is changed by Phase 0 or Phase 1.
- the frontend does not calculate payment, EMI, waiver, invoice, receipt,
  accounting, reconciliation, stock, deposit, commission, payout, or
  rent/lease truth.
- missing integration is shown as a consolidation state, not mock data.
- existing operational pages remain the active workflow until each workbench
  reaches parity.

## Phase 1 implementation

The shared layer is under:

`frontend/src/components/admin-workbench/`

The domain configuration is under:

`frontend/src/domains/admin-workbenches/`

Phase 1 route shells use query-parameter tabs and hand off to current live
routes. They introduce no new operational mutations.
