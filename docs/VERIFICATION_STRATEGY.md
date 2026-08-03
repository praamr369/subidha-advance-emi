# Verification Strategy — how to actually check everything (feasibly, solo)

The [pre-production checklist](PRE_PRODUCTION_CHECKLIST.md) lists 2,543 endpoints
and 651 pages. Checking each one from scratch is infeasible for one person. This
plan makes it feasible by exploiting a measured fact: **the surface is built from
a small number of shared parts.** You verify each shared part **once**, automate
the mechanical checks, and then only inspect the **business-logic delta** per
item.

All numbers below are measured from the live codebase (regenerate with the
scripts in §7).

---

## 1. The reduction (why this is tractable)

**Backend — 2,543 endpoints collapse to a few dozen "things to actually verify":**
- **Auth is ~8 gates, not 2,543 checks.** Permission usage: `IsAuthenticated`
  ×1,759, `IsAdmin` ×1,485, then `IsCustomer` 64, `IsPartner` 40, `AllowAny` 37,
  `IsCashierOrAdmin` 20, `IsVendor` 19, `IsStaff` 17. **Verify each gate once**
  with a role-matrix test → auth is proven for the whole surface.
- **CRUD scaffolding is ~10 base classes.** Endpoints inherit from a few bases:
  `AdminOnlyModelViewSet` (130 endpoints), `AdminAccountingModelViewSet` (92),
  `AdminAccountingPhase3ViewSet` (70), `AdminInventoryModelViewSet` (66),
  `AdminBillingModelViewSet` (60), `ModelViewSet` (142). **Verify each base once**
  (auth, pagination, list/create/retrieve/update/delete shape) → the CRUD half of
  ~500 endpoints is proven.
- **129 endpoints are trivial** (`RedirectView` 103, `APIRootView` 26) — smoke
  only.
- **~150 ViewSets** each bundle ~5–7 endpoints as one unit; you verify the
  **custom actions + querysets** (the delta), not each verb separately.
- **~527 function/bespoke views** are the real bespoke surface — grouped into the
  **29 route groups** of [`inventory/routes.md`](inventory/routes.md).

Net: the "verify auth + CRUD" bulk (thousands of endpoint-verbs) collapses to a
few dozen once-off checks; the genuine manual work is the **per-ViewSet-action +
per-bespoke-view business logic**, on the order of ~700 units, most of them small.

**Frontend — 649 pages collapse similarly:**
- **20 layouts** and **`ERPPageShell` used by 422 pages** — verify the shells,
  nav, auth-redirect, table, form, and pagination components **once**.
- **61 thin redirect pages** and **93 tiny pages** (<400 chars) — smoke only.
- The remaining ~475 real pages cluster into **8 sections** (admin 455, customer
  66, partner 30, vendor 12, cashier 10, staff 8, …). Per page you check only the
  **data-load + primary-action delta**, because the shell/nav/auth is already
  proven.

## 2. The four-layer method

Run these layers in order; each shrinks what the next must do.

- **Layer A — Automate the mechanical (once, then CI).** Auth matrix, endpoint
  smoke, schema conformance, page-load smoke. Turns "does it 200/403 and render"
  into a green bar you never hand-check again.
- **Layer B — Verify shared parts once.** The ~8 gates, ~10 base ViewSets, the
  frontend shells/components/pagination. Sign each off in a **coverage ledger**.
- **Layer C — Verify the deltas.** Per-ViewSet custom actions/querysets;
  per-bespoke-view logic; per-page data+action. Clustered by route group / page
  section so a whole cluster shares context.
- **Layer D — End-to-end workflows.** The money/stock journeys from checklist
  Phase 4 — the only truly manual, full-chain runs.

## 3. Layer A — automate the mechanical (highest leverage)

Build these once; they then run in CI and remove the mechanical dimension from
manual work forever.

1. **Auth/role matrix test.** Parameterize over every URL (walk the URLconf) ×
   {anon, customer, partner, cashier, vendor, staff, admin}. Assert: anon→401 on
   protected, wrong-role→403, `AllowAny`→200. One test proves auth for all 2,543.
   *Data source:* the same URLconf walk used by `gen_routes.py`.
2. **Endpoint smoke.** For every GET endpoint with resolvable kwargs, assert it
   does not 500 (200/400/403/404 all acceptable). Catches import/attribute crashes
   like the `direct_sale.customer_name` bug this project already hit.
3. **OpenAPI conformance.** `manage.py spectacular` must stay exit-0; optionally
   assert responses validate against the schema for a sampled set.
4. **Page-load smoke (Playwright).** For each of the 649 routes (derive from
   [`inventory/pages.md`](inventory/pages.md)), load as the appropriate role and
   assert: no console error, no error boundary, main content present. Reuse the
   existing Playwright setup (`frontend/tests/e2e`). This alone discharges hygiene
   points 1–2 and 4 for every page.

**Exit of Layer A:** a green CI job that mechanically covers auth + no-crash +
render for the entire surface. Manual work now only concerns *correctness of
business logic and specific actions*.

## 4. Layer B — verify shared parts once (the multiplier)

Verify and sign off each shared building block a single time. Because hundreds of
endpoints/pages inherit them, this is where the leverage is.

**Backend base classes** (verify auth + pagination + CRUD shape + audit hook):
`AdminOnlyModelViewSet`, `AdminAccountingModelViewSet`, `AdminAccountingPhase2/3ViewSet`,
`AdminInventoryModelViewSet`, `AdminBillingModelViewSet`, `SubscriptionAdminViewSet`,
`ReadOnlyModelViewSet`, plain `ModelViewSet`, `PaginatedSubscriptionAdminViewSet`.

**Permission gates** (verify each blocks correctly): `IsAdmin`, `IsCustomer`,
`IsPartner`, `IsCashierOrAdmin`, `IsVendor`, `IsStaff`, `IsAdminAIEnabled`,
`CanManageBrochures`, `AllowAny`, plus `@require_capability` gates.

**Shared services patterns** (verify the contract once): the accounting **bridge**
(operational event → journal), the **pagination** helpers
(`AdminListPagination`/`AdminOptInPagination`, `build_paginated_payload`), the
**audit** helper, `secret_crypto`.

**Frontend shared parts** (verify once, in light+dark, mobile+desktop):
`ERPPageShell`, the 20 layouts, the nav + auth-redirect, `PaginationControls`,
the shared table, the shared form/validation, toast/error handling, and the
`ROUTES` map correctness.

**Exit of Layer B:** a signed coverage ledger (§6) marking every shared part
verified. Every page/endpoint that only uses shared parts is now "green by
inheritance" — you only owe it a delta check.

## 5. Layer C — verify the deltas (the real, but bounded, work)

Now walk the inventories, but only inspect what's *new* per item.

**Backend, by the 29 route groups** ([`inventory/routes.md`](inventory/routes.md)),
priority: `admin` → `cashier`/`payments`/`accounting`/`billing`/`contracts` →
`reconciliation`/`settlements` → portals. Per item:
- ViewSet → verify only its **custom `@action`s and `get_queryset` filters** (the
  base CRUD is already signed off).
- Bespoke function/APIView → verify its specific rule + happy + one failure path.
- Tick the ✓ box in `routes.md`.

**Frontend, by the 8 sections** ([`inventory/pages.md`](inventory/pages.md)):
- Redirect/tiny pages → confirm the redirect target only.
- Real page → verify only **data-load correctness + the primary action persists**
  (render/auth already proven by Layer A). Do a whole section in one sitting since
  it shares a layout.
- Tick the ✓ box in `pages.md`.

## 6. Coverage ledger (how you track "everything")

Coverage is provable = the union of:
1. **Layer A CI green** — auth + smoke + render for all 2,543 + 651 (automated,
   re-runs every release).
2. **Layer B ledger** — every shared part signed off once (a checklist table).
3. **Layer C ✓ boxes** — every delta ticked in `routes.md` / `pages.md`.
4. **Layer D sign-off** — the workflow table in the pre-production checklist.

"Everything is checked" ⇔ (1) is green ∧ (2) fully ticked ∧ (3) every ✓ box set ∧
(4) signed. Keep the ledger in the repo (or a tracking issue) so partial progress
survives across days.

## 7. Tooling to build (small, one-time)

- `scripts/gen_routes.py`, `gen_pages`, `gen_modules` — already exist as the
  inventory generators; wire them into a `make inventories` step.
- `backend/tests/test_auth_matrix.py` — the URLconf × roles matrix (Layer A.1).
- `backend/tests/test_endpoint_smoke.py` — GET-no-500 sweep (Layer A.2).
- `frontend/tests/e2e/page-smoke.spec.ts` — load-every-route-per-role (Layer A.4),
  seeded from `pages.md`.
- `docs/coverage_ledger.md` — the Layer B/C/D tracking table.

## 8. Sequencing & effort (solo, realistic)

| Step | What | Effort | Outcome |
|---|---|---|---|
| 1 | Layer A automation (auth matrix + smoke + page-load) | 2–4 days | Mechanical coverage of the whole surface, forever, in CI |
| 2 | Layer B shared parts sign-off | 1–2 days | ~500 endpoints + ~475 pages "green by inheritance" |
| 3 | Layer C backend deltas (route-group by route-group) | 4–7 days | Every custom action/bespoke view ticked |
| 4 | Layer C frontend deltas (section by section) | 3–5 days | Every real page's data+action ticked |
| 5 | Layer D workflows + Phase 6 ops/security | 1–2 days | End-to-end + go-live gate |

~2–3 focused weeks solo — and after step 1, **every future release re-verifies the
mechanical surface automatically**, so subsequent passes are only the delta for
what changed.

## 9. Definition of done

- [ ] Layer A CI job green (auth matrix, endpoint smoke, page-load smoke, schema).
- [ ] Layer B ledger: every shared base class, gate, service pattern, and frontend
      shell/component signed off.
- [ ] Layer C: every ✓ box ticked in `inventory/routes.md` and `inventory/pages.md`.
- [ ] Layer D: pre-production checklist Phases 4 and 6 signed.
- [ ] Inventories regenerated against the shipped build (counts reconciled).
