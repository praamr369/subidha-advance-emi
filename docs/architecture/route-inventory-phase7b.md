# Phase 7B Generated Route Inventory Refresh + Route Checker Hardening

Branch: `update`

Status: **Implemented as a static route-checker hardening pass**

Date: 2026-05-28

## Scope

Phase 7B refreshes the route inventory/checking workflow after recent route additions, including Phase 7C Setup Readiness and the product recontract/addendum workflow.

This phase is frontend/static-analysis only. No backend endpoints, models, serializers, financial services, payment flows, accounting services, reconciliation services, inventory services, delivery services, commission/payout services, amendment execution services, or recontract services were changed.

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
docs/architecture/route-inventory-phase7b.md
```

## Checker hardening added

`frontend/scripts/check-routes.mjs` now checks:

1. App Router page collisions.
2. Compatibility route stubs that must continue to exist.
3. Recently added required routes:
   - `/admin/setup/readiness`
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

`buildAdminFinanceAccountStatementPrintRoute()` still targets:

```text
/admin/finance/accounts/[financeAccountId]/statement/print
```

The page is not currently present in the observed App Router tree, and no primary navigation exposes it. Phase 7B treats it as a warning/deferred builder, not a hard failure, to avoid inventing a fake print page or deleting a potentially planned compatibility builder.

Future safe options:

| Option | Classification | Notes |
|---|---|---|
| Add the real finance-account statement print page | migrate then keep | Only if there is a real payload/service contract. |
| Redirect builder to an existing canonical finance/accounting statement route | fix now only if confirmed | Requires confirming an existing implemented route and API contract. |
| Remove the builder | defer | Do not remove until usage search confirms it is unused. |

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

## Required Phase 7B route checks

The hardened checker explicitly covers these requested recent route families:

```text
/admin/setup/readiness
/admin/contract-amendments/recontract-report
/admin/contract-amendments/:id/recontract-addendum/print
/customer/contract-amendments/:id/recontract-addendum/print
/admin/contract-amendments
/admin/contract-amendments/:id
/customer/contract-amendments
/customer/contract-amendments/:id
/partner/contract-amendments
/partner/contract-amendments/:id
```

The checker normalizes App Router dynamic segments such as `[id]` and `[caseId]` into route patterns for comparison.

## Backend impact

No backend files changed in Phase 7B.

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

No audit records are created or mutated because this is static route tooling only.

## Daily shop usability impact

Admin navigation and route builders are less likely to drift away from real implemented pages.

The checker protects staff-facing navigation from stale or wrong-role links.

## Future rent/lease compatibility

Preserved.

No rent/lease route family was removed. Existing rent/lease print route-builder coverage remains in the checker:

```text
/admin/rent-lease/contracts/[id]/contract/print
```

Future route additions should update `requiredRoutes` or `builderRoutes` in `frontend/scripts/check-routes.mjs` when the route is operationally important or used by route builders.

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

Do not run:

```bash
bash scripts/run-release-candidate.sh
```

## Expected result

`npm run check:routes` should fail on:

- route collisions
- missing compatibility routes
- missing required recent routes
- route constants pointing to missing pages, except documented allow-list items
- admin/role navigation pointing to missing pages
- exact duplicate visible nav entries
- customer/partner/cashier/vendor links pointing to wrong role prefixes
- required route builders targeting missing pages
- obvious print route dashboard shell contamination

It may warn on:

```text
buildAdminFinanceAccountStatementPrintRoute
```

until that deferred builder is either implemented, redirected to a confirmed real route, or removed after usage review.
