# Full Webapp Test Plan — pre-production, step by step

One runnable sequence for testing the **entire** webapp (all modules, workflows,
actions, services) before going live. This does **not** replace the existing
gates — it *orders* them into a start-to-finish run:

- Gate definition → [`PRE_PRODUCTION_CHECKLIST.md`](PRE_PRODUCTION_CHECKLIST.md) (the 7 phases you sign off).
- Why it's tractable solo → [`VERIFICATION_STRATEGY.md`](VERIFICATION_STRATEGY.md) (verify shared parts once, then only the delta).
- Row-by-row lists → [`inventory/routes.md`](inventory/routes.md), [`inventory/pages.md`](inventory/pages.md), [`inventory/modules.md`](inventory/modules.md).

**Golden rule:** never weaken a constraint/guard to make a check pass. A failing
check means the code or data is wrong — fix that.

Run every step against a **restored clone of the production DB**, never the live DB.

---

## Stage 0 — Environment up (once)

- [ ] Restore latest prod DB dump onto a clone.
- [ ] Boot backend + frontend via `.claude/launch.json` (dev harness). Confirm `/healthz`, `/readyz`, `/api/v1/health/deep/` all return 200.
- [ ] Regenerate inventories so they match this build (Developer Guide §8) — routes/pages/modules.
- [ ] Have one login per role ready: **admin, cashier, partner, vendor, staff, customer**.

> **Run log — 2026-08-18 (full production-readiness sweep after inventory enterprise refactor):**
> All gates green after fixing 1 latent 500 + 5 pre-existing test failures.
>
> **Frontend gates:** `typecheck` ✅ (exit 0), `check:routes` ✅ (599 pages / 421 constants / 225 admin registry links / 0 warnings), `lint` ✅ (0 errors, 423 pre-existing warnings — unused vars / any / unused params, no bugs), `build:smoke` ✅ (full Next.js production build, all routes compiled).
>
> **Backend gates:** `manage.py check` ✅ (0 issues), `makemigrations --check --dry-run` ✅ (no drift).
>
> **Layer-A verification suite (53 tests, walks all ~1,529 /api/v1 endpoints as multiple roles):** first run caught **1 real 500 crash** — `AdminOwnerLoanScheduleView.get()` on `/api/v1/admin/finance/owner-funds/schedule-preview/` raised `TypeError: missing pk` (view bound to two URLs, POST-only preview vs GET-with-pk schedule). Fixed by making `pk` optional and returning 405 on the preview route's GET. Added regression test `tests.accounting.test_owner_funds_api`. Re-run: 53/53 ✅ OK.
>
> **Scoped inventory/manufacturing/accounting bridge tests (62 tests):** first run had 4 errors + 1 fail — all confirmed **pre-existing on clean HEAD** (reproduced with uncommitted work stashed), unrelated to the session's inventory refactor. Root causes + fixes (all committed):
> 1. `tests.manufacturing.test_production_workflow` × 2 — ERROR `No active financial year configured`. Test setUp never seeded accounting posting prereqs; sibling `test_manufacturing_endpoints.py` does. **Fix:** added `ensure_test_accounting_posting_prerequisites(reference_date=date(2026, 4, 20))` to setUp.
> 2. `tests.inventory.test_inventory_valuation` — FAIL `'0.00' != '1800.00'`. `_calculate_on_hand_qty_bulk` in `inventory/services/valuation_service.py` summed only StockLedger, ignoring both `opening_stock_qty` and the `SOFT_HOLD_MOVEMENT_TYPES` exclusion — a real valuation understatement bug for opening-balance-only items. **Fix:** rewrote to match the canonical stock formula from `stock_service.py:87` (`opening + Σin − Σout`, excluding soft-holds), pass `item` through to avoid an extra query. Financial-integrity impact: valuation reports were undercounting opening-balance inventory.
> 3. `tests.inventory.test_demand_planning_module.test_demand_planning_result_contains_expected_inputs` — ERROR `ValidationError: Batch is LOCKED — new subscriptions cannot be enrolled (CTRL-LP-5)`. Test created a LOCKED batch then tried to enroll into it; the guard now (correctly) rejects. **Fix:** enroll while OPEN, then lock via `.update(status="LOCKED")` (fixture-only bypass, business rule preserved).
> 4. `tests.inventory.test_inventory_vendor_sandbox_seed.test_seed_creates_records_and_is_idempotent` — ERROR `Missing active INVENTORY_ASSET chart account` → `No JOURNAL_ENTRY numbering profile for FY2026-27`. **Fix:** setUp now calls `AccountingSetupService.bootstrap()` + `ensure_test_accounting_posting_prerequisites()` before seeding.
>
> Result after fixes: **62/62 ✅ OK** across the scoped suite, **53/53 ✅ OK** on full Layer-A verification.
>
> **UAT smoke:** frontend + backend booted; `/login` and `/products` render with 0 console errors; endpoint smoke coverage (all 1,529 endpoints × multiple roles) already provided by Layer-A gate. Interactive admin click-through deferred (no local admin creds).
>
> **Files changed this run:**
> - `backend/api/v1/views/admin_owner_funds.py` — `pk` optional guard for shared view
> - `backend/inventory/services/valuation_service.py` — canonical on-hand formula (soft-hold exclusion + opening_stock_qty)
> - `backend/tests/manufacturing/test_production_workflow.py` — accounting prereqs in setUp
> - `backend/tests/inventory/test_demand_planning_module.py` — enroll-then-lock ordering
> - `backend/tests/inventory/test_inventory_vendor_sandbox_seed.py` — bootstrap chart + numbering
> - `backend/tests/accounting/test_owner_funds_api.py` — new regression suite (4 tests)
>
> No production API/schema changes. Migrations unchanged. Financial-integrity impact: **valuation service now reports correct totals for items with opening_stock_qty > 0** — recompute any stored InventoryValuation snapshots after deploy if historical totals matter for audit.
>
> ---
>
> **Run log — 2026-08-06 (Stage 1 executed):**
> Backend all green — `check` 0 issues; `check --deploy` under production settings has **no** security warnings (HSTS/SSL-redirect/secure-cookies/DEBUG all correct); no migration drift; `migrate` no-op; `spectacular` exit 0. Only cosmetic drf_spectacular W001/W002 doc hints remain (non-blocking).
> Frontend — `typecheck` ✅ clean; `build` ✅ (498 static pages, exit 0); `check:routes` was ❌ **74 pre-existing committed route-drift errors** → **now ✅ PASSES (0 errors)**; `lint` ❌ 330 problems (133 errors: ~280 hygiene [no-unused-vars/no-explicit-any/unescaped-entities] — deferred; **32 react-hooks warnings** reviewed = idiomatic timers/mount-fetch, no bugs, left as-is).
>
> **Route-drift fix (74→0):** repointed stale route constants in `src/lib/routes.ts` to their real pages + created 8 compatibility redirect stubs (`partners|partner/commissions[+misspellings]`, `finance/commisions`, `finance/reconciliation`, `emi/overdue`, `crm/customers/[id]`) + built a new `/admin/setup/readiness` go-live hub page. C3 repoints carrying a `// TODO: confirm` (default choices, may want revisiting): `accountingBooksUpi`→books/bank, `deliveryCreate|Workspace|Returns`→/admin/deliveries, `luckyPlanBatches`→/admin/lucky-ids.

## Stage 1 — Automated gates (green bar before any manual work)

Backend (`.venv` python, `backend/`):
```bash
python manage.py check
python manage.py check --deploy
python manage.py makemigrations --check --dry-run
python manage.py migrate            # on the clone
python manage.py spectacular --file schema.yml
```
Frontend (`frontend/`):
```bash
npm run validate                    # check:routes + lint + typecheck + dashboard-presets + build
```
Automated suites — the auth/endpoint/page locks that prove the mechanical surface:
```bash
# backend money-path + auth-matrix + endpoint-smoke (Layer A/B)
python manage.py test payments accounting contracts reconciliation settlements
# frontend release smoke (ops health + admin/cashier/partner/customer journeys)
cd frontend && npm run test:e2e:install && npm run test:e2e:release-smoke && npm run test:e2e:route-smoke
```
- [ ] All of the above exit clean. **Do not proceed manually until this bar is green** — it removes ~thousands of "does it 200/403/render" checks from the manual list.

> **Run log — Playwright frontend proxy (2026-08-07):** blocked by two infra issues, no app defect. (1) `start_playwright_backend.sh` fell through to system Python (missing `drf_spectacular`) on Windows — **fixed** by adding Windows `.venv/Scripts/python.exe` candidates. (2) After that, `config.webServer` timed out at 420s (slow SQLite migrate+seed or settings — needs separate infra investigation). Frontend auth-redirect/role-gating is instead covered by the green backend auth-matrix (Stage 2) + the manual Stage-4 UI walkthrough. Revisit the Playwright proxy for CI separately.

## Stage 2 — Shared parts (verify ONCE)

Because 422 pages share `ERPPageShell` and the API auth collapses to ~8 gates and
~10 base ViewSets, sign these off a single time and never re-hand-check them:

- [ ] **Auth gates** (once each): anon→401, wrong-role→403, right-role→200 for `IsAuthenticated`, `IsAdmin`, `IsCashierOrAdmin`, `IsPartner`, `IsVendor`, `IsStaff`, `IsCustomer`, `AllowAny`.
- [ ] **Base ViewSets** (once each): list/create/retrieve/update/delete shape + pagination for `AdminOnlyModelViewSet`, `AdminAccountingModelViewSet`, `AdminInventoryModelViewSet`, `AdminBillingModelViewSet`, `ModelViewSet`.
- [ ] **Frontend shells/components**: `ERPPageShell`, nav + auth-redirect, KPI rows, tables, forms, `PaginationControls`, empty/loading/error states.

> **Run log — Stage 3 backend automated (2026-08-07):**
> Module delta suite (`tests/verification/*_delta.py` + bridge/surface-gated) — **27 tests OK**. Gap-module suite (commissions, CRM, lucky-plan, manufacturing, service_desk, month/year-end close) — **142/144 pass; 2 pre-existing failures** in accounting bridge-readiness *reporting* (not money-path): `test_year_end_close_service::…recommended_actions_and_counts` (unsupported_source_count 0≠1) and `test_commission_payout_bridge_readiness_phase5::…events_are_exposed` (commission event keys not all present on empty-DB endpoint call). Underlying features exist in services (commission_accrual/approval/payout synthesized; unsupported-source classification present); failures look like test contract/seed drift on the `update` branch tip. Money-posting path green (`test_accounting_bridge` + deltas).
>
> **RESOLVED (2026-08-07):** both green + a bigger latent bug fixed. (1) year-end test was stale — now asserts the intentional `staff_advance_boundary` split. (2) commission readiness exposed two real bugs: the endpoint never folded in the commission-payout supplement (fixed), and — root cause — `_source_model_exists` declared `source_app="subscriptions"` for models the subscriptions split relocated (Commission→commissions, Payment→payments, Subscription→contracts, RentLeaseBillingDemand/RentLeaseDepositTransaction→payments, OperationalCancellation→contracts, AuditLog→audit, CreditNote→BillingCreditNote). **8 bridge-readiness event types were silently dropped from the operator go-live view.** Hardened the resolver to fall back to name-based lookup across apps + added regression guard `tests/verification/test_bridge_event_specs_resolve.py`. 14/14 green.

## Stage 3 — Module-by-module walkthrough (the delta)

Order by money-risk. For **each module**: (a) open its main register page — renders,
data loads, pagination present; (b) run its primary create/update **action** and
verify it persisted server-side + wrote an `AuditLog` row; (c) attempt one
**deliberate bad action** and confirm the guard blocks it (not a 500).

| # | Module (app) | Primary action to exercise | Guard to prove blocks |
|---|---|---|---|
| 1 | `accounts` / `audit` | login, role assignment, password reset | capability gate blocks unauthorized role change |
| 2 | `customers` + KYC | create customer, upload KYC, review | self-upload gated to SUBMITTED; admin upload force_review |
| 3 | `crm` | lead → stage transitions → convert | invalid stage transition rejected |
| 4 | `products` / `products_pim` / `catalog` | create product, publish to public | required PIM attributes enforced |
| 5 | `inventory` / `deliveries` | opening stock, deliver, return/restock | stock ledger append-only; no deliver without stock effect |
| 6 | `contracts` | EMI enrolment → term lock → cancel | enrolment blocked after batch lock (CTRL-LP-5) |
| 7 | `subscriptions` | rent/lease contract → monthly demand | term-locked contract rejects edits |
| 8 | `billing` | invoice, allocation override | `billing.override_allocation` actually gates |
| 9 | `payments` | cashier collect (cash/bank/UPI) → receipt | no double payment per EMI intent; over-collection blocked |
| 10 | `accounting` | ops→accounting bridge posts journal | cannot post to a closed period / without mappings |
| 11 | `reconciliation` | statement import → match → allocate | unmatched rows can't force-allocate |
| 12 | `settlements` | settlement run / matching | balances non-negative |
| 13 | `commissions` | accrual → payout batch → payout | payout batch idempotent |
| 14 | `lucky_plan` | batch → lock → draw commit → reveal → winner | reveal must match commit hash |
| 15 | `finance_control` / `finance` | daily close, month/year-end close | books balance; period lock applies |
| 16 | `manufacturing` | production order (if in scope) | BOM/stock consistency |
| 17 | `migration_center` | staging→validate→dedupe→preview→approve→import | rollback restores clean state |
| 18 | `service_desk` / `reviews` / `growth` / `reminders` | create ticket / review / campaign | role-gating correct |
| 19 | `business_setup` | reset on clone | preserves admin, clears operational data cleanly |

Tick each module in [`inventory/modules.md`](inventory/modules.md) as you go. For
mutating services confirm: runs in a transaction, audit-logged (no plaintext
secrets), permission-gated at the **view** (not just UI), failure leaves data
consistent, reversible actions restore correct state.

> **Run log — Stage 4 unauthenticated pass (2026-08-07):** in-app browser against the dev servers (frontend :3000, backend :8000 healthy). Confirmed frontend route-gating: protected `/admin/customers`, `/cashier/collections/control-center`, `/partner` all redirect to login; public `/products` + `/login` render without auth. **Authenticated role journeys below are NOT yet done** — Claude cannot enter passwords to authenticate (safety rule) and the Browser pane isn't compositing (no screenshots) in this session, so they need the operator logged in (or a session token minted without password entry). Their service-layer equivalents are already covered green by the Stage-3 delta + gap suites.

> **Run log — Stage 4 mutating journeys (2026-08-07, admin via real Chrome):**
> **① EMI collection — DONE, verified end-to-end.** Quick Collect on EMI-JUL2026-2026-0073 (Devendranath Dubey), posted ₹4,500 cash → Main Cash Desk, with double-confirm ("post the receipt and may update the accounting bridge"). Result: **Payment #1 created** (₹4,500, Active, SUB-76, EMI 1081) + **Money Receipt POSTED, doc RCP/FY2026-27/00005**. Full chain UI→API→DB→receipt→reconciliation proven.
> **② KYC approval — not runnable.** KYC Review Queue is empty (0 in queue); the "6 pending" on the customer register are customers who have not *uploaded* documents, so nothing is in a reviewable state. Correct guard behaviour — an approval needs a submitted doc first (requires a customer upload, which needs customer login).
> **③ Direct sale — not completed.** The "Create Direct Sale Invoice" control is an in-page anchor, not a modal; the inline builder didn't surface cleanly via automation. 5 existing posted direct sales render fine (SALE/FY2026-27/00001–00005). Service layer is green via `test_billing_action_delta`.

## Stage 4 — End-to-end workflows (browser, real roles)

Tick only when the whole chain is correct: **UI action → API → service → DB →
audit → downstream (accounting/stock/notification)**.

- [ ] Lead → customer → KYC → contract → delivery (EMI).
- [ ] Rent/lease contract → monthly demand → collection → deposit handling.
- [ ] Cashier collection (cash/bank/UPI) → receipt → daily close.
- [ ] Direct sale → invoice → delivery case → payment → posting.
- [ ] Purchase order → goods receipt → vendor bill → payment.
- [ ] Bank/UPI statement import → reconciliation → allocation.
- [ ] Return/exchange → stock restock → credit/debit note.
- [ ] Commission accrual → payout batch → payout.
- [ ] Lucky-plan batch → lock → draw commit → reveal → winner.
- [ ] Month-end / year-end close (books balance; locks apply).
- [ ] Business setup reset on clone (preserves admin; clears operational data).

> **Run log — Stage 5 authenticated sweep (2026-08-07, admin via real Chrome):** drove the logged-in admin session (superuser "pradip"). All render + load live data, no console errors: **Admin dashboard** (Cash ₹23,300 / Bank ₹4,700 / dues ₹2,000, live from posted journals); **Customer Register** (77 customers, 6 KYC pending, 73 contracts, ₹17,38,750 outstanding); **EMI Ledger** (1,095 rows, pagination 1/22 working); **Direct Sale Workspace**; **Deliveries** (clean empty-state 0/0/0/0); **Inventory/Stock Posture** (+ inventory bridge-readiness widget); **Commission Register** (+ *commission bridge-readiness* widget — the UI consumer of the bug I fixed); **Reconciliation Center** (redirect stub `/admin/payments/reconciliation` → bridge-reconciliation resolves, liability posture OK). Screenshot-verified. Authenticated *mutating* journeys (actually posting a collection/sale) not yet run — see Stage 4.

## Stage 5 — Page hygiene (by section, not by page)

Verify shells once (Stage 2), then per page only the data + action delta. Walk
[`inventory/pages.md`](inventory/pages.md) grouped by the 8 sections (admin 455,
customer 66, partner 30, vendor 12, cashier 10, staff 8, public, …). 5-point
rubric per page: renders / data loads / primary action persists / role-gating
correct / responsive + dark mode. Confirm pagination on every large register.

## Stage 6 — Data, security & operability (go-live)

```bash
python manage.py check_production_readiness --settings=core.settings.production
```
- [ ] Encryption: at-rest secrets via `secret_crypto`; TLS enforced; secure/CSRF cookies on; `SECRET_KEY` not placeholder; `CORS_ALLOWED_ORIGINS` has no `*`.
- [ ] Redis cache in prod (not LocMemCache).
- [ ] Backup + **test restore** on clone succeeds; retention set.
- [ ] Audit trail spot-check (recent admin actions → `AuditLog` rows).
- [ ] Rollback: DB snapshot taken immediately before deploy; `push-live.ps1` → `deploy.sh` rollback path known.
- [ ] Observability: `/healthz` + `/readyz` OK; errors surfaced.

## Sign-off

| Stage | Result | Date |
|---|---|---|
| 0 Environment | | |
| 1 Automated gates | | |
| 2 Shared parts | | |
| 3 Modules | | |
| 4 Workflows | | |
| 5 Page hygiene | | |
| 6 Data/security/ops | | |

**Go-live only when every stage is signed and every blocking box is ticked.**
