# Phase 19 — Compatibility / Legacy Route Cleanup Plan (Docs-only)

Date: 2026-05-21  
Scope: documentation + audit only (no route deletion/rename/move; no behavior change).  
Source of truth inspected: `frontend/src/app` + `frontend/src/config/navigation.ts` + `frontend/src/lib/routes.ts` + `frontend/src/config/admin-route-registry.ts` + `frontend/scripts/check-routes.mjs` + `frontend/tests/e2e/**`.

## 1) Executive summary

SUBIDHA CORE’s UI migration preserved a set of **compatibility/legacy/alias routes** to protect:

- bookmarked staff URLs
- older documentation links
- e2e smoke flows that intentionally validate legacy paths
- cross-role entrypoints (`/profile`, `/settings`)

This Phase 19 pass **does not delete, rename, or move any routes**. It documents the current state and defines an additive, release-safe path to remove legacy routes later **only after** usage verification and test readiness.

Key findings:

- Route inventory size (App Router `page.tsx`): **393** (from `docs/design/kiranism-route-category-map.json`).
- Automated compatibility expectations: `frontend/scripts/check-routes.mjs` enforces **11** compatibility routes remain present.
- Known typo route `/partner/commisions` exists and currently redirects to `/partner/commissions`; it must remain working now, but is explicitly classified as **MIGRATE THEN DELETE** (future phase).
- Additional redirect-only / alias routes exist outside the 11 enforced compatibility routes (e.g. `/admin/analytics`, `/admin/reports-center`, `/admin/workspace`, `/admin/lucky-draw/history`).

## 2) Current route count

- **Total Next.js App Router page routes:** **393** (`docs/design/kiranism-route-category-map.json`).
- Notes:
  - This count includes redirect-only compatibility stubs (`redirect(...)`) and thin alias pages (re-export/import another page).
  - This count does **not** include API routes beyond what exists under `frontend/src/app/api/**` (not part of this pass).

## 3) Compatibility route inventory

This section inventories routes that exist primarily for compatibility/legacy reasons (redirect-only, alias, duplicate) and are candidates for controlled cleanup later.

Legend:
- **Navigation**: referenced by sidebar/top-level navigation (`frontend/src/config/navigation.ts`) or prominent role landing pages.
- **Tests**: referenced in `frontend/tests/e2e/**`.
- **Bookmarks**: likely to be bookmarked/linked externally by staff/users.

### 3.1 Enforced compatibility routes (must exist)

These are explicitly enforced as “must exist” by `frontend/scripts/check-routes.mjs` (missing any causes `npm run check:routes` to fail).

| Route URL | File path | Current behavior | Canonical route (if known) | Navigation | Tests | Bookmark risk | Risk level | Recommended action | Deletion readiness | Required follow-up |
|---|---|---|---|---:|---:|---:|---|---|---|---|
| `/admin/partners/commissions` | `frontend/src/app/(dashboard)/admin/partners/commissions/page.tsx` | Redirects to finance commissions list | `/admin/finance/commissions` | No | No | Medium | Medium | KEEP TEMPORARILY | Not ready | Verify no navigation/docs link; track usage before removal |
| `/admin/partners/commisions` | `frontend/src/app/(dashboard)/admin/partners/commisions/page.tsx` | Redirects to finance commissions list (typo) | `/admin/finance/commissions` | No | Yes (`admin.spec.ts`) | Medium | High | KEEP TEMPORARILY | Not ready | Migrate tests + docs to canonical; keep 1+ release cycle |
| `/admin/partner/commissions` | `frontend/src/app/(dashboard)/admin/partner/commissions/page.tsx` | Redirects to finance commissions list (singular) | `/admin/finance/commissions` | No | No | Medium | Medium | KEEP TEMPORARILY | Not ready | Confirm partner-singular alias is still needed; track usage |
| `/admin/partner/commisions` | `frontend/src/app/(dashboard)/admin/partner/commisions/page.tsx` | Redirects to finance commissions list (singular + typo) | `/admin/finance/commissions` | No | No | Medium | Medium | KEEP TEMPORARILY | Not ready | Keep until canonical adoption is confirmed |
| `/admin/finance/reconciliation` | `frontend/src/app/(dashboard)/admin/finance/reconciliation/page.tsx` | Delegates to reconciliation workspace component | `/admin/finance/reconciliation` (canonical) | Yes (admin registry) | Yes | High | High | DO NOT DELETE | Not eligible | If `/admin/reconciliation` is deprecated later, make it a redirect-only stub (future phase) |
| `/admin/finance/commisions` | `frontend/src/app/(dashboard)/admin/finance/commisions/page.tsx` | Redirects to `/admin/finance/commissions` (typo) | `/admin/finance/commissions` | No | Yes (`workflow_readiness_smoke.spec.ts`) | Medium | High | KEEP TEMPORARILY | Not ready | Keep; add explicit compatibility coverage if tests are migrated off |
| `/admin/emi/overdue` | `frontend/src/app/(dashboard)/admin/emi/overdue/page.tsx` | Redirects to `/admin/emis/overdue` | `/admin/emis/overdue` | No | Yes | Medium | High | KEEP TEMPORARILY | Not ready | Prefer canonical everywhere; verify no navigation uses legacy path |
| `/customer/emis` | `frontend/src/app/(dashboard)/customer/emis/page.tsx` | Redirects to `/customer/subscriptions` | `/customer/subscriptions` | No | Yes (`customer.spec.ts`) | Medium | High | KEEP TEMPORARILY | Not ready | Keep; ensure nav avoids it; maintain compatibility test |
| `/profile` | `frontend/src/app/profile/page.tsx` | Role-based redirect via `subidha_role` cookie | Role root (admin/customer/partner/cashier) | No | No | Medium | Medium | KEEP | Not eligible | Keep as cross-role entry; consider adding explicit audit note in auth docs (future docs pass) |
| `/settings` | `frontend/src/app/settings/page.tsx` | Role-based redirect via `subidha_role` cookie | Role settings/profile | No | No | Medium | Medium | KEEP | Not eligible | Keep as cross-role entrypoint (also `roleFamily: compatibility` in map) |
| `/partner/commisions` | `frontend/src/app/(dashboard)/partner/commisions/page.tsx` | Redirects to `/partner/commissions` preserving query | `/partner/commissions` | No | No | High | High | MIGRATE THEN DELETE | Not ready | See dedicated migration plan below; keep ≥ 1 release cycle |

### 3.2 Additional legacy / compatibility routes (not enforced by check-routes)

These are legacy/alias routes found in `frontend/src/app` that are either redirect-only or thin aliases. They are not in `check-routes.mjs` but are relevant to a cleanup plan.

| Route URL | File path | Current behavior | Canonical route (if known) | Navigation | Tests | Bookmark risk | Risk level | Recommended action | Deletion readiness | Required follow-up |
|---|---|---|---|---:|---:|---:|---|---|---|---|
| `/admin/workspace` | `frontend/src/app/(dashboard)/admin/workspace/page.tsx` | Redirects to `/admin/erp` | `/admin/erp` | No | No | Medium | Medium | KEEP TEMPORARILY | Not ready | Consider adding to enforced compatibility list if truly required long-term |
| `/admin/analytics` | `frontend/src/app/(dashboard)/admin/analytics/page.tsx` | Redirects to `/admin/reports?live=1` | `/admin/reports` | No | Yes | Medium | High | REDIRECT THEN DELETE LATER | Not ready | Ensure no navigation uses it; keep until usage is verified low |
| `/admin/reports-center` | `frontend/src/app/(dashboard)/admin/reports-center/page.tsx` | Redirects to `/admin/reports?catalog=1` | `/admin/reports` | No | No | Medium | Medium | REDIRECT THEN DELETE LATER | Not ready | Keep until report-center deep links are verified stable |
| `/admin/lucky-draw` | `frontend/src/app/(dashboard)/admin/lucky-draw/page.tsx` | Redirects to `/admin/lucky-draws` | `/admin/lucky-draws` | No | No | Medium | Medium | KEEP TEMPORARILY | Not ready | Consider adding to enforced compatibility list if needed |
| `/admin/lucky-draw/history` | `frontend/src/app/(dashboard)/admin/lucky-draw/history/page.tsx` | Redirects (alias map) to `/admin/lucky-draws` | `/admin/lucky-draws` | No | Yes | Medium | High | KEEP TEMPORARILY | Not ready | Keep as explicit legacy test target or migrate tests to canonical history surface |
| `/admin/payments/history` | `frontend/src/app/(dashboard)/admin/payments/history/page.tsx` | Redirects to `/admin/payments` preserving query | `/admin/payments` | No | Yes | Medium | High | KEEP TEMPORARILY | Not ready | Keep; migrate tests to canonical once stable |
| `/admin/payments/create` | `frontend/src/app/(dashboard)/admin/payments/create/page.tsx` | Redirects to `/admin/finance/collect` preserving query | `/admin/finance/collect` | No | No | Medium | Medium | KEEP TEMPORARILY | Not ready | Keep while older docs still reference this create path |
| `/admin/payments/reconciliation` | `frontend/src/app/(dashboard)/admin/payments/reconciliation/page.tsx` | Redirects to reconciliation with `view=payments` + forwarded query | `/admin/finance/reconciliation?view=payments` | No | Yes | Medium | High | KEEP TEMPORARILY | Not ready | Keep; migrate tests to canonical query form eventually |

## 4) Duplicate route inventory

Duplicates here means “multiple URLs intentionally route to the same underlying UI/workspace”.

### 4.1 Partner commissions duplication (must remain for compatibility)

- Canonical surface: `/partner/commissions` → `frontend/src/app/(dashboard)/partner/commissions/page.tsx`
- Typo legacy alias: `/partner/commisions` → `frontend/src/app/(dashboard)/partner/commisions/page.tsx` (redirect-only)

### 4.2 Admin commissions duplication (plural/singular + typo)

All routes below redirect to `/admin/finance/commissions`:

- `/admin/partners/commissions`
- `/admin/partners/commisions` (typo)
- `/admin/partner/commissions`
- `/admin/partner/commisions` (typo)
- `/admin/finance/commisions` (typo of canonical finance commissions)

## 5) Redirect-only route inventory

Redirect-only pages found (uses `redirect(...)`):

- `/admin/analytics` → `/admin/reports?live=1`
- `/admin/reports-center` → `/admin/reports?catalog=1`
- `/admin/workspace` → `/admin/erp`
- `/admin/emi/overdue` → `/admin/emis/overdue`
- `/customer/emis` → `/customer/subscriptions`
- `/admin/lucky-draw` → `/admin/lucky-draws`
- `/admin/billing/direct-sale/create` → `/admin/billing/direct-sale?mode=create`
- `/admin/batches/[id]/generate-lucky-ids` → `/admin/batches/[id]`
- `/admin/payments/reconciliation` → `/admin/finance/reconciliation?view=payments&…`

## 6) Alias route inventory

Alias routes are thin wrappers that either:

- **delegate** to another page component (import and render), or
- **re-export** a canonical page as default export.

Examples found:

- `/admin/finance/reconciliation` delegates to `/admin/reconciliation` implementation (`frontend/src/app/(dashboard)/admin/finance/reconciliation/page.tsx`).
- `/cashier/billing` delegates to `/cashier/collect` (`frontend/src/app/(dashboard)/cashier/billing/page.tsx`).
- `/customer/dashboard` re-exports `/customer` (`frontend/src/app/(dashboard)/customer/dashboard/page.tsx`).
- `/customer/delivery` re-exports `/customer/deliveries` (`frontend/src/app/(dashboard)/customer/delivery/page.tsx`).
- `/admin/reports/collections` re-exports revenue report (`frontend/src/app/(dashboard)/admin/reports/collections/page.tsx`).
- `/admin/crm/customers/[id]` re-exports `/admin/customers/[id]` (`frontend/src/app/(dashboard)/admin/crm/customers/[id]/page.tsx`).
- `/admin/sales/direct-sale/create` reuses the direct-sale workspace component (`frontend/src/app/(dashboard)/admin/sales/direct-sale/create/page.tsx`).

Recommended action for these alias routes:

- Default: **KEEP** unless there is a clear canonical URL policy and measurable zero usage.
- Any deletion must follow: redirect-first → compatibility window → usage verification → removal in a separate phase.

## 7) Legacy typo route inventory

Confirmed typo routes:

- `/partner/commisions` (partner commissions typo) — **must migrate to canonical then delete later**
- `/admin/finance/commisions` (finance commissions typo)
- `/admin/partners/commisions` (partners commissions typo)
- `/admin/partner/commisions` (partner commissions typo)

## 8) Navigation references found

Navigation sources audited:

- `frontend/src/config/navigation.ts` (role sidebar groups)
- `frontend/src/config/admin-route-registry.ts` (admin tree used by navigation)

Findings:

- Sidebar navigation references the **canonical** partner commissions route (`ROUTES.partner.commissions` → `/partner/commissions`).
- No sidebar navigation items point directly to typo routes like `/partner/commisions` or `/admin/finance/commisions`.

## 9) Smoke/test references found

Legacy/compatibility routes referenced in e2e smoke/specs:

- `/admin/analytics`:
  - `frontend/tests/e2e/phase3_admin_operations_smoke.spec.ts`
  - `frontend/tests/e2e/admin.spec.ts`
- `/admin/emi/overdue`:
  - `frontend/tests/e2e/admin.spec.ts`
  - `frontend/tests/e2e/workflow_readiness_smoke.spec.ts`
- `/admin/finance/commisions`:
  - `frontend/tests/e2e/workflow_readiness_smoke.spec.ts`
- `/admin/partners/commisions`:
  - `frontend/tests/e2e/admin.spec.ts`
- `/admin/payments/reconciliation`:
  - `frontend/tests/e2e/admin.spec.ts`
  - `frontend/tests/e2e/release-smoke.spec.ts`
- `/admin/payments/history`:
  - `frontend/tests/e2e/workflow_readiness_smoke.spec.ts`
- `/admin/lucky-draw/history`:
  - `frontend/tests/e2e/workflow_readiness_smoke.spec.ts`
- `/customer/emis`:
  - `frontend/tests/e2e/customer.spec.ts`

## 10) Risk classification per route

Risk is classified primarily by operational impact, not by code complexity:

- **Critical**: affects auth/session entrypoints, financial posting flows, or is canonical for core operations.
- **High**: referenced by tests, likely bookmarked by staff, or used as stable entrypoint in documentation.
- **Medium**: legacy alias for convenience; not in navigation; lower usage expected but unknown.
- **Low**: internal-only aliases with extremely low bookmark likelihood.

## 11) Recommended action per route (table)

This table is the “single recommendation view” across the compatibility set.

| Route URL | Recommended action | Notes |
|---|---|---|
| `/partner/commisions` | **MIGRATE THEN DELETE** | Required by Phase 19 constraints; keep working now |
| `/admin/finance/commisions` | KEEP TEMPORARILY | Typos must remain until usage is zero/acceptable |
| `/admin/partners/commisions` | KEEP TEMPORARILY | Tests currently use it |
| `/admin/partner/commisions` | KEEP TEMPORARILY | Likely bookmarked/typed; keep until verified |
| `/admin/partners/commissions` | KEEP TEMPORARILY | Non-typo alias; keep until usage verified |
| `/admin/partner/commissions` | KEEP TEMPORARILY | Non-typo alias; keep until usage verified |
| `/admin/emi/overdue` | KEEP TEMPORARILY | Redirect to canonical `/admin/emis/overdue` |
| `/customer/emis` | KEEP TEMPORARILY | Redirect to canonical `/customer/subscriptions` |
| `/admin/payments/reconciliation` | KEEP TEMPORARILY | Redirects to canonical reconciliation view=payments |
| `/admin/payments/history` | KEEP TEMPORARILY | Redirect to canonical register |
| `/admin/payments/create` | KEEP TEMPORARILY | Redirect to canonical collect workflow |
| `/admin/analytics` | REDIRECT THEN DELETE LATER | Already redirect-only; remove only after usage verification |
| `/admin/reports-center` | REDIRECT THEN DELETE LATER | Already redirect-only; keep while users have old links |
| `/admin/workspace` | KEEP TEMPORARILY | Redirect to `/admin/erp` |
| `/admin/lucky-draw` | KEEP TEMPORARILY | Redirect to `/admin/lucky-draws` |
| `/admin/lucky-draw/history` | KEEP TEMPORARILY | Redirect to canonical draw surface |
| `/profile` | KEEP | Cross-role entrypoint |
| `/settings` | KEEP | Cross-role entrypoint |
| `/admin/finance/reconciliation` | DO NOT DELETE | Canonical URL (admin registry + routes.ts) |

## 12) Required migration steps before deletion

Before any route is deleted (in a later phase), complete:

1. Ensure a single **canonical route** is documented and used in navigation.
2. Ensure all internal links (`ROUTES.*`, `build*Route`, hardcoded hrefs) point to canonical route.
3. Ensure tests stop depending on legacy paths except explicit compatibility tests.
4. Ensure a redirect exists for a compatibility window (or maintain a stub route).
5. Verify usage in logs/analytics is zero or within acceptable threshold.

## 13) Required user-facing compatibility period

Minimum recommended compatibility windows:

- **Typo routes** (e.g. `commisions`): keep for **≥ 1 full release cycle** after navigation/test migration, because bookmarks are common.
- **Legacy workspace entrypoints** (e.g. `/admin/analytics`, `/admin/reports-center`): keep for **≥ 1–2 release cycles** after usage drops.

## 14) Required analytics/logging check before removal

Do not remove a legacy route until all are true:

- Route hit counts are available (reverse proxy logs / Next server logs / analytics events).
- The route’s 7-day and 30-day usage is **zero or acceptable**.
- Any remaining usage is explained (e.g. a single old SOP document or a kiosk bookmark) and remediated.

## 15) Test requirements before route removal

Before removing any route:

- Add (or preserve) a **compatibility test** verifying old → canonical routing for each route being removed.
- Update e2e flows to use canonical paths for normal workflow coverage.
- Run at minimum: `cd frontend && npm run check:routes` (and the project’s usual smoke suite in the deletion phase).

## 16) Final deletion eligibility checklist

For each route proposed for removal (future phase), require a checklist sign-off:

- [ ] Canonical route documented and stable
- [ ] Navigation points only to canonical
- [ ] No e2e tests rely on legacy path (except compatibility tests)
- [ ] Redirect/stub maintained for ≥ 1 release cycle
- [ ] Usage verified low/zero (7d + 30d windows)
- [ ] Operational runbook/docs updated
- [ ] Deletion is in a **separate phase** from migration

---

# Required plan: `/partner/commisions` migration (future phase)

Classification (required): **MIGRATE THEN DELETE**

1. Keep route working now (do not delete in Phase 19).
2. Ensure `/partner/commissions` is canonical.
3. Ensure all navigation points to `/partner/commissions`.
4. Add or preserve redirect from `/partner/commisions` to `/partner/commissions`.
5. Confirm no tests depend on typo path except compatibility tests.
6. Add compatibility test if missing.
7. Keep compatibility for at least one release cycle.
8. Delete only after route usage is verified as zero or acceptable.
9. Never delete in the same phase as the migration.

