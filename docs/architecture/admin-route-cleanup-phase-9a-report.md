# Phase 9A — Cleanup Audit & Safe Repo Hygiene Report

Status: **complete (classification + safe hygiene only — no deletions).**
Branch: `update`. Date: 2026-06-16.

Phase 9A audits the admin route surface after the Phase 0–8 module
categorisation and applies only **safe, low-risk, additive** fixes. It does
**not** delete route pages or backend endpoints, rename models, remove
migrations, alter database fields, or touch EMI / payment posting / receipt /
lucky-draw waiver / rent-lease / commission / payout / reconciliation /
accounting-bridge / audit semantics.

## Root cause

After Phases 0–8 the admin app accreted three reconcilable patterns:

1. **Dual route families** — canonical module routes (e.g. `/admin/profiles/*`,
   `/admin/lucky-plan/*`, `/admin/finance/*`, `/admin/requests/*`) were added as
   thin redirect aliases while the legacy routes kept hosting the real pages. The
   migration map labelled the *legacy* paths as `alias`, but the live redirect
   direction is **canonical → legacy**, so the legacy path is actually the
   content owner (`keep_temporarily`) and the canonical path is the `alias`.
2. **Documented backend gaps surfaced as routes** — several classified routes
   (winners, customer-analytics, vendor-returns, customer-credits, refunds,
   vendor ledger/outstanding, service-desk/cases) have no backend aggregate /
   endpoint yet. They were (correctly) left as honest empty states, stubs, or
   pageless route constants — but the classification was scattered across docs,
   page files, and the taxonomy.
3. **No lock** prevented a future phase from silently deleting a preserved
   route, flipping a redirect, faking readiness, or merging Manufacturing.

Phase 9A consolidates the classification, documents the alias topology in code,
and adds a guard test — without changing any runtime behaviour.

## Files changed

| File | Change | Risk |
|---|---|---|
| `frontend/tests/unit/route-cleanup-phase-9a.test.ts` | **New.** 14 classification + safety-boundary guard tests (file-content based). | none (test only) |
| `frontend/src/lib/routes.ts` | Added compatibility-alias topology comment block (no constant changed). | none (comment only) |
| `frontend/src/app/(dashboard)/admin/profiles/{customers,partners,vendors,branches,parties}/page.tsx` | Added "intentionally-preserved compatibility alias" header comments. | none (comment only) |
| `docs/architecture/admin-route-migration-map.md` | Appended "Phase 9A — Final classification" section. | none (doc) |
| `docs/architecture/admin-route-cleanup-phase-9a-report.md` | **New.** This report. | none (doc) |

`/admin/profiles/staff/page.tsx` already carried an equivalent Phase 7 alias
comment and was left unchanged.

## Safe fixes applied

1. **Stale frontend tests** — none required. All 139 existing file-content route
   tests pass. The lone `node --test` failure (`dashboard-widget-board.test.ts`)
   is **not stale**: it imports a real TS module via an extensionless path and is
   designed to run through the dedicated `npm run test:dashboard-presets` runner
   (`tsc` emit → `node --test` on `.js`), which passes green. Raw
   `node --test *.test.ts` cannot resolve extensionless `.ts` imports; this is an
   environment quirk, not a Phase 0–8 regression. Left as-is.
2. **Unused imports** — none introduced or found on touched files (only comments
   were added). Verified by `npm run typecheck` + `npm run lint`.
3. **Misleading UI copy** — none found on the classified routes; unsafe copy was
   already remediated in Phases 4–8. Verified by a targeted scan for posting /
   settlement / reconciliation / payroll / stock-movement verbs across all
   classified gap and stub pages (zero hits).
4. **Compatibility-alias comments** — added (see Files changed).
5. **Route smoke tests** — added for canonical module hubs and the classified
   routes that already exist (the new test file).

## Required audit categories

### 1. Route aliases and canonical routes

Canonical routes are **thin page-level redirects to legacy content owners**.
Direction (canonical → legacy):

```text
/admin/profiles/customers        → /admin/customers
/admin/profiles/partners         → /admin/partners
/admin/profiles/vendors          → /admin/vendors
/admin/profiles/branches         → /admin/branches
/admin/profiles/staff            → /admin/hr/staff
/admin/profiles/parties          → /admin/crm/parties
/admin/lucky-plan/batches        → /admin/batches
/admin/lucky-plan/lucky-ids      → /admin/lucky-ids
/admin/lucky-plan/draws          → /admin/lucky-draws
/admin/finance/outstandings      → /admin/outstandings
/admin/finance/customer-advances → /admin/customer-advances
/admin/requests/online-enquiries → /admin/online-enquiries
/admin/requests/support          → /admin/support-requests
/admin/requests/subscriptions    → /admin/subscription-requests
```

Plus runtime path aliases in `ADMIN_ROUTE_ALIASES` (e.g. misspelling guards
`/admin/finance/commisions`, `/admin/partners/commissions`, legacy
`/admin/lucky-draw*`, `/admin/payments/*`). These are safe-to-keep.

### 2. Navigation duplicates

No problematic duplicates. Intentional dual-listings are documented:
- CRM & Requests lists both the legacy request pages and their `(via /requests)`
  canonical alias entries — intentional discoverability, not a bug.
- `vendorsQuotes` carries `vendorsSourcing` as a child — intentional.
Every navigation `href` in `ADMIN_ROUTE_REGISTRY` resolves to an existing
`page.tsx` (verified programmatically — zero dead links).

### 3. Missing page files

Intentionally pageless route constants / taxonomy entries (no nav item links to
them, so no dead links):
- `/admin/service-desk/cases` — nav "Cases" points at the `/admin/service-desk`
  hub; the cases route is classified in the taxonomy but has no dedicated page.
- `/admin/finance/customer-credits` — no page, no backend endpoint.
- `/admin/finance/refunds` — no standalone page; reversal-control owns refunds.

### 4. Pages with unsafe copy

None. Classified gap/stub pages are honest:
- `lucky-plan/winners` — documents the missing aggregate endpoint, shows no fake
  winners, and restates the future-EMI-only waiver rule (read-only).
- `reports/customer-analytics` — `EmptyState` + "Not yet implemented" badge, no
  fetch.
- `vendors/ledger`, `vendors/outstanding` — honest navigation stubs pointing to
  per-vendor detail/APIs.

### 5. Dead buttons or fake actions

None found. Stub pages contain no action buttons that imply posting /
settlement / reconciliation / payroll / stock movement.

### 6. Stale tests

None. See "Safe fixes applied #1". `dashboard-widget-board.test.ts` is an
environment/runner quirk, not a stale assertion.

### 7. Unused imports from touched files

None. Only comments were added to touched files; `typecheck` + `lint` clean.

### 8. Backend endpoints apparently unused by frontend

- `POST /api/v1/winner/execute-winner/` (`ExecuteWinnerView`) exists, but there
  is **no aggregate winners list endpoint**, so the winners *register* page has
  no read contract to consume (documented gap, not removed).
- Several accounting/reconciliation list endpoints exist; consumption is mapped
  in Phases 4 & 8 and unchanged here. No endpoint removed in Phase 9A.

### 9. Frontend routes with no backend contract

| Route | Backend reality |
|---|---|
| `/admin/lucky-plan/winners` | only `execute-winner` action; no winners aggregate |
| `/admin/reports/customer-analytics` | no cohort/retention/churn aggregate |
| `/admin/purchases/vendor-returns` | page exists; no aggregate endpoint |
| `/admin/vendors/ledger` | per-vendor detail only; no aggregate ledger |
| `/admin/vendors/outstanding` | per-vendor detail only; no aggregate outstanding |
| `/admin/finance/customer-credits` | no endpoint (and no page) |
| `/admin/finance/refunds` | reversal-control endpoint owns refunds (no page) |

### 10. Deferred backend gaps that need real endpoints later

- Winners aggregate (winner records + EMI-waiver status across all batches).
- Customer-analytics cohort / retention / churn aggregates (+ export).
- Vendor-returns aggregate register endpoint.
- Vendor ledger / outstanding aggregate endpoints.
- Customer-credits source endpoint.
- `EmployeeDocument` verify/reject: model has `ACTIVE`/`INACTIVE` only (no
  `VERIFIED`/`REJECTED`) — UI documents this as a gap.
- `EmployeeProfile` lacks first-class `weekly_off` and
  `emergency_contact_relation`.
- Staff `ONBOARDING` is accepted as a frontend workflow value but `EmployeeStatus`
  persists only `DRAFT`/`ACTIVE`/`INACTIVE` (ONBOARDING → DRAFT).

All require approved additive migrations — **out of scope for Phase 9A**.

### 11. Manufacturing classification decision

**Keep separate and deferred.** Manufacturing stays as registry navigation group
11 (Manufacturing), outside the canonical 14 modules. Pages (`/admin/manufacturing`,
`/boms`, `/jobs`) and routes are preserved unchanged. It must **not** be merged
into Inventory & Stock or Purchases & Vendors without a later, explicit module
design approval. Guarded by a new test.

### 12. Phase 9B candidates

See "Phase 9B proposed work" below.

## Route classification table

See the appended "Phase 9A — Final classification" table in
`docs/architecture/admin-route-migration-map.md`. Summary:

- **alias** (thin redirect, no content): all `/admin/profiles/*`,
  `/admin/lucky-plan/{batches,lucky-ids,draws}`,
  `/admin/finance/{outstandings,customer-advances}`, `/admin/requests/*`.
- **keep_temporarily** (legacy content owner / documented gap): `/admin/customers`,
  `/admin/partners`, `/admin/vendors`, `/admin/branches`, `/admin/crm/parties`,
  `/admin/batches`, `/admin/lucky-ids`, `/admin/lucky-draws`,
  `/admin/outstandings`, `/admin/customer-advances`, `/admin/online-enquiries`,
  `/admin/support-requests`, `/admin/subscription-requests`,
  `/admin/service-desk/cases`, `/admin/finance/customer-credits`,
  `/admin/finance/refunds`, `/admin/manufacturing` (+boms/jobs).
- **keep** (real surface, may have backend gap): `/admin/hr/staff`,
  `/admin/vendors/ledger`, `/admin/vendors/outstanding`,
  `/admin/purchases/vendor-returns`, `/admin/reports/customer-analytics`,
  `/admin/lucky-plan/winners`.

### Stale route aliases

None to retire in Phase 9A. The only "stale-looking" labels were the migration
map's `alias` tags on legacy content routes; these are reconciled in the
appended Phase 9A table (legacy = `keep_temporarily`, canonical = `alias`).

### Safe-to-keep aliases

All redirect aliases listed in category #1, plus the `ADMIN_ROUTE_ALIASES`
runtime guards (misspellings, legacy `/admin/lucky-draw*`, `/admin/payments/*`,
`/admin/setup/readiness`, `/admin/workspace`).

### migrate_then_alias candidates (Phase 9B, not acted on)

`/admin/customers`, `/admin/partners`, `/admin/branches`, `/admin/crm/parties`,
`/admin/batches`, `/admin/lucky-ids`, `/admin/lucky-draws`,
`/admin/outstandings`, `/admin/customer-advances`, `/admin/online-enquiries`,
`/admin/support-requests`, `/admin/subscription-requests` — move page content to
the canonical path, then flip each redirect.

### delete_later candidates

**None.** No path qualifies until its content has moved to the canonical route
(Phase 9B) and the alias has redirected safely through a release cycle.

### Do-not-delete routes (preserved)

Every route in the classification table; every backend endpoint; every model,
migration, and database field. Explicitly **not deleted**: all 20 routes the
phase brief named for classification, all Manufacturing routes, all legacy
content-owning routes, and all backend endpoints.

## Backend gaps documented

Winners aggregate, customer-analytics aggregates, vendor-returns aggregate,
vendor ledger/outstanding aggregates, customer-credits endpoint, EmployeeDocument
verify/reject states, EmployeeProfile `weekly_off` / `emergency_contact_relation`,
Staff `ONBOARDING` persistence. (Detail in category #10.)

## Frontend gaps documented

- `/admin/customer-advances` is a reachable route (page exists, active redirect
  target) but has **no named `ROUTES` constant** — add one in Phase 9B or
  formally retire the path.
- Pageless documented gaps: `service-desk/cases`, `finance/customer-credits`,
  `finance/refunds`.
- Stub-only surfaces awaiting aggregate endpoints: `vendors/ledger`,
  `vendors/outstanding`.

## Manufacturing decision

Separate and deferred — not merged into Inventory/Purchases. Preserved as
navigation group 11, outside the canonical 14. Requires explicit module design
approval before any merge/expansion. (Category #11.)

## Phase 9B proposed candidates

1. Flip alias direction (`migrate_then_alias`): move page content into canonical
   `/admin/profiles/*`, `/admin/lucky-plan/*`, `/admin/finance/*`,
   `/admin/requests/*`; legacy paths become aliases.
2. Build deferred backend aggregates: winners, customer-analytics
   (cohort/retention/churn), vendor-returns, vendor ledger/outstanding,
   customer-credits — then replace the corresponding empty states/stubs with
   real pages.
3. Resolve `/admin/finance/refunds` — dedicated page or permanent alias to
   reversal-control.
4. Add the missing `/admin/customer-advances` ROUTES constant (or retire path).
5. Approved additive migrations: `EmployeeDocument` VERIFIED/REJECTED;
   `EmployeeProfile.weekly_off` / `emergency_contact_relation`; first-class Staff
   `ONBOARDING` status.
6. Manufacturing module design decision.
7. Only after the above + one release cycle: promote settled legacy paths to
   `delete_later` and remove with explicit approval.

## Impact assessment

- **API contract changes:** none. No endpoint, serializer, or field added,
  changed, or removed.
- **Backend impact:** none. No backend file changed; no migration.
- **Existing data impact:** none. No model, migration, or field touched.
- **Financial integrity impact:** none. EMI calc, payment posting, receipts,
  deposits/demands, commissions, payouts, reconciliation, accounting bridge —
  all untouched. No JournalEntry/MoneyMovement/Payment/ReceiptDocument/
  StockLedger/AccountingBridgePosting/ReconciliationItem/SalaryPayment/
  Commission/Payout created from cleanup work.
- **Auditability impact:** positive. Alias topology, classification, and safety
  boundaries are now documented in code + a guard test; lucky-draw waiver
  semantics restated read-only on the winners page (no change to logic).
- **Daily shop usability impact:** none negative. No route moved or removed; all
  pages reachable exactly as before.
- **Future rent/lease compatibility impact:** none. Rent/lease deposit/monthly-
  demand semantics and routes untouched; rent/lease stays in Sales & Contracts /
  Delivery & Service as before.
- **Remaining risks:** low. Comment-only code edits cannot change runtime; the
  one `node --test` failure is a pre-existing environment quirk (passes via the
  dedicated runner). Phase 9B carries the real risk and is deferred.
