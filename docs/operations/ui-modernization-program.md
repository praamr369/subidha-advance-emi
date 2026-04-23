# SUBIDHA CORE UI Modernization Program

## Objective

Modernize the frontend into a premium, enterprise-grade operational workspace without changing the approved stack, route architecture, business rules, or financial control boundaries.

This program is additive by default. It preserves:

- existing APIs and JWT session flows
- EMI collection behavior
- finance and accounting domain separation from cashier and subscription collection rails
- auditability, reconciliation, commissions, payouts, and lucky draw workflows
- role-safe navigation and route protection

## Wave Order

### Wave 1 - Shared UI foundation

Status: Implemented in this pass

Scope:

- shared workspace surface tokens and spacing hierarchy
- portal shell, sidebar, topbar, page container width, and section framing
- shared page header, action bar, KPI band, filter bar, table wrapper, status badges, and metric cards
- modal and drawer semantic polish with stable labeling

### Wave 2 - Auth, public entry, and role dashboard shells

Status: Implemented in this pass

Scope:

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/unauthorized`
- role dashboard first-screen framing for admin, cashier, customer, and partner

Guardrails:

- no auth contract change
- no redirect logic change
- no public registration rule change

### Wave 3 - Admin control-center tier 1

Status: Partially implemented in this pass

Primary routes touched:

- `/admin`
- `/admin/collections`

Next priority routes:

- `/admin/operations`
- `/admin/branch-reporting`
- `/admin/analytics`
- `/admin/reports`
- `/admin/customers`
- `/admin/crm`
- `/admin/crm/leads`
- `/admin/leads`
- `/admin/crm/parties`
- `/admin/support-requests`
- `/admin/service-desk`
- `/admin/billing`

### Wave 4 - Finance, accounting, billing, and inventory operations

Status: Seeded in this pass through shared framework and direct page adoption

Primary routes touched:

- `/admin/finance`
- `/admin/accounting`

Next priority routes:

- `/admin/finance/commissions`
- `/admin/finance/reconciliation`
- `/admin/finance/payout-batches`
- `/admin/accounting/chart-of-accounts`
- `/admin/accounting/journals`
- `/admin/accounting/books/*`
- `/admin/accounting/reports/*`
- `/admin/accounting/vendors`
- `/admin/accounting/vendor-settlements`
- `/admin/accounting/purchase-bills`
- `/admin/billing/*`
- `/admin/inventory/*`
- `/admin/reconciliation`

Guardrails:

- keep accounting posting lanes visually and operationally separate from EMI and cashier collection flows
- cross-link domains only when context remains explicit

### Wave 5 - Customer, partner, cashier, and public detail surfaces

Status: Seeded in this pass through dashboard adoption and cashier collection polish

Primary routes touched:

- `/cashier`
- `/cashier/collect`
- `/customer`
- `/partner`

Next priority routes:

- `/cashier/payments/*`
- `/customer/profile`
- `/customer/subscriptions/*`
- `/customer/payments/*`
- `/customer/support/*`
- `/customer/subscription-requests/*`
- `/partner/customers/*`
- `/partner/payments/*`
- `/partner/collections/*`
- `/partner/payouts`
- shared public product and information pages as needed

## Exit Criteria For Remaining Waves

Each wave should ship only when the updated routes:

- use shared page chrome instead of ad hoc wrappers
- keep real endpoint usage only
- preserve role-safe actions and navigation
- expose truthful loading, empty, and error states
- avoid nested interactive elements and hydration mismatches
- pass lint, typecheck, route checks, build, and relevant Playwright smoke coverage
