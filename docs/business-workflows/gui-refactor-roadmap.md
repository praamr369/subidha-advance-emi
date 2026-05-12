# GUI refactor roadmap (Phase 6A–6H)

This roadmap is **documentation-only** and is constrained to existing UI routes.

Source of truth for routes:
- `docs/frontend/page-route-inventory.md`
- `docs/frontend/page-layout-taxonomy.md`

## Current cross-module operator surfaces

- Operations working screen: `/admin/operations`
- Operations command center: `/admin/operations/command-center`
- Admin dashboard: `/admin`

## Refactor principles (non-breaking)

- Prefer `PortalPage` and existing page shells.
- Keep list pages **register-first** (search/filter/table first).
- Keep create/edit pages **transaction-first** (form first).
- Keep detail pages **object/detail-first** (key identity + related tabs/lists).
- Keep approval pages **queue-first** (explicit decision + audit).

## Route clusters to maintain consistency (existing)

### Money

- Collections: `/cashier/collect`, `/admin/finance/collections`
- Payments: `/admin/payments`
- Reconciliation: `/admin/payments/reconciliation`, `/admin/finance/reconciliation`, `/admin/accounting/reconciliation`
- Period control: `/admin/accounting/periods`
- Journals: `/admin/accounting/journals`

### Contracts

- Subscriptions: `/admin/subscriptions`
- Lucky draw: `/admin/lucky-draw`
- Waivers: `/admin/waivers`

### Sales

- Direct sales: `/admin/billing/direct-sales`
- Billing: `/admin/billing`

### Customers / CRM / Support

- Customers: `/admin/customers`
- CRM: `/admin/crm`, `/admin/leads`, `/admin/online-enquiries`
- Service desk: `/admin/service-desk`

### Inventory / Delivery

- Inventory workspace: `/admin/inventory/workspace`
- Stock: `/admin/inventory/stock-on-hand`
- Movements: `/admin/inventory/movements`
- Deliveries: `/admin/deliveries`

### HR

- HR workspace: `/admin/hr`
- Attendance: `/admin/hr/attendance`
- Leave: `/admin/hr/leave`
- Salary: `/admin/hr/payroll`

## Change control

- Any GUI refactor that touches money flows (collections, payments, reconciliation) must be validated via the release candidate script.
- Avoid cross-module “shortcuts” that bypass established operational routes.
