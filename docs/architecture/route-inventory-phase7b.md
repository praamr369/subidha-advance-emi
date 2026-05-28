# Phase 7B Generated Route Inventory Refresh + Route Checker Hardening

Branch: `update`

Status: **Implemented as a static route-checker hardening pass; Phase 7H role-navigation stabilization noted**

Date: 2026-05-28

## Scope

Phase 7B refreshes the route inventory/checking workflow after recent route additions, including Phase 7C Setup Readiness and the product recontract/addendum workflow.

This phase is frontend/static-analysis only. No backend endpoints, models, serializers, financial services, payment flows, accounting services, reconciliation services, inventory services, delivery services, commission/payout services, amendment execution services, or recontract services were changed.

## Phase 7H release-stabilization note

Phase 7H is release stabilization and role-specific polish. It does not introduce new financial behavior.

Targeted Phase 7H navigation fixes:

- Admin route constants now expose `/admin/collections/control-center` as `ROUTES.admin.collectionControlCenter`.
- Cashier route constants now expose `/cashier/collections/control-center` as `ROUTES.cashier.collectionControlCenter`.
- Admin navigation includes the real **Collection Control Center** under Finance & Accounting.
- Cashier navigation includes the real **Collection Control Center** under Collections.
- Cashier navigation no longer exposes a fake/deferred `Rent / Lease Collection` shortcut because rent/lease collection remains visibility-only until an approved endpoint exists.
- Cashier `Cash Closing` now points to `/cashier/day-close` instead of payment history.

No route family was deleted. Compatibility routes remain preserved.

Full RC validation is required before merge/deploy.

## Existing route tooling found

`frontend/package.json` already exposes:

```text
npm run inventory:routes
npm run check:routes
```

Before Phase 7B:

- `inventory:routes` generated `docs/operations/frontend-route-inventory.md` from `frontend/src/app/**/page.tsx`.
- `check:routes` checked only App Router route collisions and a small compatibility-route list.

Phase 7B kept the same script names and hardened the existing checker instead of adding a second checker.

## Files changed

```text
frontend/scripts/check-routes.mjs
frontend/src/lib/route-builders.ts
frontend/src/lib/routes.ts
frontend/src/config/admin-route-registry.ts
frontend/src/config/navigation.ts
docs/architecture/route-inventory-phase7b.md
```

## Checker hardening added

`frontend/scripts/check-routes.mjs` now checks:

1. App Router page collisions.
2. Compatibility route stubs that must continue to exist.
3. Recently added required routes:
   - `/admin/setup/readiness`
   - `/admin/collections/control-center`
   - `/cashier/collections/control-center`
   - `/admin/contract-amendments`
   - `/admin/contract-amendments/[id]`
   - `/admin/contract-amendments/recontract-report`
   - `/admin/contract-amendments/[id]/recontract-addendum/print`
   - `/customer/contract-amendments`
   - `/customer/contract-amendments/[id]`
   - `/customer/contract-amendments/[id]/recontract-addendum/print`
   - `/partner/contract-amendments`
   - `/partner/contract-amendments/[id]`
4. Route constants in `frontend/src/lib/routes.ts` that point to missing pages.
5. Admin route registry entries in `frontend/src/config/admin-route-registry.ts` that point to missing pages.
6. Partner/customer/cashier/vendor navigation entries in `frontend/src/config/navigation.ts` that point to missing pages.
7. Duplicate visible navigation entries with the same role/group/label/path tuple.
8. Wrong-role navigation exposure for non-admin roles.
9. Route-builder contracts in `frontend/src/lib/route-builders.ts`.
10. Print-route contamination markers for obvious dashboard/page-shell imports.

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

## Route-builder hardening

Added explicit route builders:

```text
buildAdminContractAmendmentRoute(id)
buildAdminRecontractReportRoute(params)
buildCustomerContractAmendmentRoute(id)
buildPartnerContractAmendmentRoute(id)
```

Existing recontract addendum route builders are preserved:

```text
buildAdminProductRecontractAddendumPrintRoute(id)
buildCustomerProductRecontractAddendumPrintRoute(id)
```

## Known deferred route-builder warning

`buildAdminFinanceAccountStatementPrintRoute()` targets:

```text
/admin/finance/accounts/[financeAccountId]/statement/print
```

The finance-account statement print page exists at:

```text
/admin/finance/accounts/[id]/statement/print
```

The checker should treat `[financeAccountId]` and `[id]` as equivalent dynamic route segments. Do not add a duplicate print route for this.

## Print route check

The checker scans all App Router routes ending in `/print` and fails if the route file itself imports obvious dashboard/page-shell contamination markers such as:

```text
AdminShell
DashboardShell
AppSidebar
SidebarProvider
PageHeader
ERPPageShell
BusinessSetupLinks
DataTableShell
QuickActionGrid
```

This is intentionally conservative. It does not parse CSS print media or component internals; it catches obvious route-level contamination only.

## Inventory refresh command

Run locally:

```bash
cd ~/Desktop/subidha-lucky-plan/frontend
npm run inventory:routes
npm run check:routes
```

`npm run inventory:routes` should regenerate:

```text
docs/operations/frontend-route-inventory.md
```

Because this implementation was applied through the GitHub connector, the npm scripts were not executed here. The checker and generator are ready for local execution on branch `update`.

## Backend impact

No backend files changed in Phase 7B or the Phase 7H role-navigation stabilization note.

No endpoints were added, removed, renamed, or altered.

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

Auditability improves by making route and navigation drift detectable before release.

No audit records are created or mutated because this is static route/navigation tooling only.

## Daily shop usability impact

Admin navigation and route builders are less likely to drift away from real implemented pages.

The checker protects staff-facing navigation from stale or wrong-role links.

Cashier users now receive a real collection-readiness route and no fake rent/lease collection shortcut.

## Future rent/lease compatibility

Preserved.

No rent/lease route family was removed. Existing rent/lease visibility, subscription, delivery, return, deposit, and print routes remain intact.

Rent/lease collection remains deferred until a real approved collection endpoint exists.

## Validation commands

Run:

```bash
cd ~/Desktop/subidha-lucky-plan
git checkout update
git pull --ff-only origin update

cd frontend
npm run inventory:routes
npm run check:routes
npm run typecheck
npm run lint
```

Full Phase 7H RC validation still requires the full backend, frontend, Playwright, and release-candidate command set from the phase brief.
