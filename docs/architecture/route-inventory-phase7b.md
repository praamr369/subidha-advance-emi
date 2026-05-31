# Route Inventory, Checker, and Parent-Only Admin Sidebar

Branch: `update`

Status: **Implemented as static route-checker hardening with Phase 9D parent-only sidebar rules**

Last updated: 2026-05-31

## Scope

This document records the frontend route inventory/checking workflow and the Phase 9D admin navigation model.

This is a frontend/static-analysis and documentation area. No backend endpoints, models, serializers, financial services, payment flows, accounting services, reconciliation services, inventory services, delivery services, commission/payout services, amendment execution services, recontract services, or auth services are changed by the route checker or sidebar model.

## Phase 9D parent-only admin sidebar

Admin sidebar navigation is now parent-module-only. The sidebar must show the major ERP modules, not every child register or workflow.

Visible admin sidebar modules:

```text
Command Center              -> /admin
Sales & Contracts           -> /admin/sales
Subscription EMI            -> /admin/subscriptions
Rent / Lease                -> /admin/rent-lease
Direct Sale                 -> /admin/billing/direct-sale
Accounting & Finance        -> /admin/accounting
Inventory                   -> /admin/inventory
Manufacturing               -> /admin/manufacturing
CRM / Parties               -> /admin/crm
HR & Staff                  -> /admin/hr
Service Desk                -> /admin/service-desk
Delivery & Operations       -> /admin/deliveries
Reports & Analysis          -> /admin/reports
Settings                    -> /admin/settings
```

The full `admin-route-registry.ts` remains preserved for route inventory, hover metadata, command-palette discovery, and deep-link validation. It is not the source of visible sidebar expansion.

Child workflows must live inside module cockpit pages through icon cards, sections, tabs, filters, breadcrumbs, command search, and quick actions.

Examples of child workflows that must not leak back into the admin sidebar:

```text
Batch Register
Lucky ID Register
EMI Schedule / EMI Register
Winners
Waiver / Loss Report
Rent Monthly Demands
Security Deposits
Delivery Requests
```

## Route preservation rule

No App Router page route is deleted for this navigation cleanup. Compatibility routes remain preserved. The parent-only sidebar is a visibility change, not a routing deletion.

The new Phase 9D parent route is:

```text
/admin/rent-lease
```

It is a lightweight rent/lease cockpit linking only to existing real child routes: rent/lease contract filters, create rent, create lease, deposits, demand register filters, delivery/handover, return inspections, and delivery documents.

## Command-palette/deep-link rule

Because the visible sidebar is now parent-only, admin child routes remain discoverable through the command palette. The command palette merges admin route registry entries for ADMIN searches while keeping customer, partner, cashier, and vendor command surfaces role-scoped.

## Checker hardening

`frontend/scripts/check-routes.mjs` checks:

1. App Router page collisions.
2. Compatibility route stubs that must continue to exist.
3. Required routes including `/admin/rent-lease`, setup readiness, collection control centers, and amendment print/detail routes.
4. Route constants in `frontend/src/lib/routes.ts` that point to missing pages.
5. Full admin route registry entries in `frontend/src/config/admin-route-registry.ts` that point to missing pages.
6. Visible navigation entries in `frontend/src/config/navigation.ts` that point to missing pages.
7. Duplicate visible navigation entries.
8. Wrong-role navigation exposure for non-admin roles.
9. Admin sidebar parent module completeness.
10. Admin sidebar child-workflow leakage.
11. Route-builder contracts in `frontend/src/lib/route-builders.ts`.
12. Print-route contamination markers for obvious dashboard/page-shell imports.

## Compatibility routes retained

The checker still expects these compatibility routes to exist:

```text
/admin/partners/commissions
/admin/partners/commisions
/admin/partner/commissions
/admin/partner/commisions
/admin/finance/reconciliation
/admin/finance/commisions
/admin/emi/overdue
/customer/emis
/profile
/settings
/partner/commisions
```

These are intentionally retained. They should not be deleted until compatibility usage is measured and a migration decision is made.

## Inventory refresh command

Run locally after adding, removing, or moving page routes:

```bash
cd ~/Desktop/subidha-lucky-plan/frontend
npm run inventory:routes
npm run check:routes
```

`npm run inventory:routes` should regenerate:

```text
docs/operations/frontend-route-inventory.md
```

If Phase 9D was applied through the GitHub connector, the generated inventory may need a local regeneration pass before merge/release.

## Backend impact

No backend files are expected to change for this phase.

No endpoints are added, removed, renamed, or altered by the parent-only sidebar.

## Existing data impact

No existing business data changes.

No migrations.

No data writes.

## Financial integrity impact

No financial business logic changed.

The phase does not mutate or weaken:

```text
payments
receipts
EMIs
subscriptions
accounting
reconciliation
settlements
inventory
delivery
commission
payout
rent/lease demand
deposits
lucky draw
lucky ID
batches
amendments
recontract records
```

## Auditability impact

Auditability is preserved because the route registry, route checker, compatibility routes, and deep-link surfaces remain explicit. Child workflows move from sidebar visibility into module cockpit pages and command search; audit-controlled underlying workflows are unchanged.
