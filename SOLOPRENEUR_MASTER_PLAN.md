# Solopreneur Master Upgrade — Full Implementation Plan (Phases 1–6)

> **For: Antigravity implementation sessions**
> **Prepared: 2026-07-20 · Repo: subidha-advance-emi (branch `update`)**
> **Companion file:** `SOLOPRENEUR_PHASE3_PLAN.md` (authoritative detail for Phase 3 — do not duplicate it, follow it)

## The problem this program solves

One person (the owner-admin) operates the **entire** webapp: ~80 admin modules (customers, subscriptions, EMI, billing, inventory, deliveries, service desk, CRM, accounting, reports, lucky draws, HR, compliance…). The enterprise-shaped UI assumes departments that don't exist. Every phase below has the same yardstick:

**"Can the solo operator finish this job in one page, with one decision, and trust the numbers?"**

## Global rules for every phase (Antigravity: read before coding)

1. **Orchestrate, never re-post.** New services call existing posting primitives (`record_emi_payment`, `collect_direct_sale_payment`, `PaymentAllocationService`, bridge runners…). Never create `Payment`/`Receipt`/`JournalEntry`/stock movements directly in new code.
2. **`apiFetch<T>` returns parsed JSON** (`frontend/src/lib/api/index.ts:469`). Never check `res.ok` / call `res.json()` on it. Paths are unprefixed (`/admin/...`); `API_BASE_URL` already ends in `/api/v1`.
3. **House UI:** `ERPPageShell` (eyebrow/title/breadcrumbs/stats/statusBadge), semantic tokens (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`), `ERPLoadingState`/`ERPErrorState`/`ERPEmptyState`, `formatRupee`, `lucide-react` icons, no `window.confirm`/`alert()`.
4. **Every new page gets wired 3 ways:** `frontend/src/lib/routes.ts` (ROUTES.admin), `frontend/src/config/admin-route-registry.ts`, and `frontend/src/config/admin-module-data.ts` (quick action / workflow entry). Unwired pages are the #1 recurring defect (see Phase 2 gaps).
5. **Backend endpoints:** `permission_classes = [permissions.IsAuthenticated, IsAdmin]` (`api.v1.permissions`); `ValidationError` → 400 with message; unexpected → logged + generic 500; never leak `str(e)` from bare `except Exception`.
6. **Heavy aggregates get a 30s cache** (`django.core.cache`) — the pattern proven by the navigation-badges fix (6013→0 queries).
7. **Verification gates per phase:** `cd frontend && npx tsc --noEmit` → 0 errors; `cd backend && .venv\Scripts\python manage.py check` → clean; new pytest tests green; manual browser walk-through of the page.

## Phase status board

| Phase | Scope | Status | Action |
|---|---|---|---|
| 1 | Command Center (Today view) | **NOT BUILT** — no artifacts found in repo | Build (this plan) |
| 2 | Finance & Accounting (daily close, ledger health) | Built, **broken at runtime** (GAP-1) + 5 more gaps | Fix per Phase 3 plan §3.0 |
| 3 | Billing & Collections (Smart Collection Engine) | Planned in `SOLOPRENEUR_PHASE3_PLAN.md` | Implement per that file |
| 4 | Inventory & Logistics cockpit | Partial primitives exist (stock-summary, deliveries workspace, SD returns lookup) | Build cockpit (this plan) |
| 5 | CRM & Customer Lifecycle | Lead→customer→fulfillment automation largely exists | Consolidate + follow-up queue (this plan) |
| 6 | Reports, Reminders & Automation | `reminders` app + `dispatch_reminders` command + scheduled-export page exist | Build digest + scheduler wiring (this plan) |

**Implementation order: 2-fixes → 3 → 1 → 6 → 4 → 5.** Rationale: Phase 2 fixes are 30 minutes and unbreak shipped work; Phase 3 is the highest daily-money value; Phase 1 needs Phase 3's outstanding endpoint to be truly useful; Phase 6's digest feeds Phase 1's action queue; 4 and 5 are workflow polish on already-strong modules.

---

# PHASE 1 — Solopreneur Command Center ("Today" view)

## Goal
The morning cockpit. One page answering: *What money comes in today? What must I do today? Is anything broken?* Replaces opening 6 modules to start the day.

## Audit note
No Phase 1 artifacts exist in the repo (only Phase 2's finance files carry the `solopreneur` name). The admin dashboard (`frontend/src/app/(dashboard)/admin/page.tsx` + `admin-module-data.ts`) is a module *launcher*, not a daily cockpit. Build Phase 1 as a separate page, don't rebuild the dashboard.

## Backend

### [NEW] `backend/api/v1/views/admin_solopreneur_today.py` + route file + urls include
```
GET /api/v1/admin/solopreneur/today/
```
One endpoint, one round trip, 30s cache (key `solopreneur:today:{localdate}`). Aggregates (all read-only, reuse existing querysets/services — check for an existing service before writing a new query):

- `money_today`: EMIs due today + overdue count/total (Emi due_date filters), direct-sale outstanding total (`balance_total` sum on collectible sales), yesterday's collections total (Payment + receipts by date).
- `cash_position`: per finance-account balances (reuse trial-balance / finance account services from accounting).
- `action_queue` (counts + top-5 lists, each item `{label, href, severity}`):
  - Pending subscription requests (`/admin/requests/subscriptions`)
  - Pending KYC (`kyc_status=PENDING` customers)
  - Deliveries blocked/pending dispatch (deliveries summary service — `getAdminDeliverySummary` backend equivalent)
  - Service-desk cases with `finance_status=PENDING` or `stock_status=PENDING`
  - Unposted bridge records (reuse ledger-health checks)
  - Reminders due today (`reminders` app)
- `health`: `is_balanced` from the (cached, GAP-5-fixed) ledger-health payload; last daily-close run date.

### Tests
`backend/tests/api/test_solopreneur_today.py` — response shape, cache hit (second call ≤ a few queries via `assertNumQueries`), each queue item href non-empty, admin-only (403 for non-admin).

## Frontend

### [NEW] `frontend/src/app/(dashboard)/admin/today/page.tsx`
`ERPPageShell` — eyebrow "Solopreneur", title "Today", stats row: Due Today ₹ / Overdue ₹ / Collected Yesterday ₹ / Ledger Balanced ✓.

Layout `xl:grid-cols-3`:
- **Left 2 cols — Action Queue.** Grouped list; each row: severity dot (red/amber/sky), label, count, deep-link button. Severity: red = money blocked or ledger imbalance; amber = pending decisions; sky = FYI. Empty state = "All clear — nothing needs you right now." (this state must look GOOD; it's the daily reward).
- **Right col — Money & Health.** Cash position per account; "Run Daily Close" button that calls the (GAP-1-fixed) `postSolopreneurDailyClose` inline with result card; link to `/admin/finance/daily-close`.

### [NEW] `frontend/src/services/solopreneur.ts`
`fetchSolopreneurToday(): Promise<SolopreneurTodayResponse>` — typed, correct `apiFetch<T>` usage.

### Wiring
- `ROUTES.admin.today = "/admin/today"`; route registry; **make it the first quick action** in `admin-module-data.ts`; add a prominent "Today" link in the admin sidebar/nav (top position).

## Acceptance
- [ ] One GET populates the whole page; second load hits cache.
- [ ] Every action-queue row deep-links to the exact filtered page that resolves it.
- [ ] Daily close runnable from this page with visible result.
- [ ] Dark mode correct; tsc clean; tests green.

---

# PHASE 2 — Finance & Accounting (SHIPPED — fix the gaps)

Already implemented: `backend/accounting/services/solopreneur_finance_service.py`, `backend/api/v1/views/admin_solopreneur_finance.py`, routes at `api/v1/urls.py:147`, page `frontend/src/app/(dashboard)/admin/finance/daily-close/page.tsx`.

**Do exactly the six fixes specified in `SOLOPRENEUR_PHASE3_PLAN.md` § "PHASE 3.0"** (GAP-1 apiFetch runtime bug — the page has never worked; GAP-2 unreachable page + dead `/admin/operations/daily-close` link at `admin-module-data.ts:222`; GAP-3 house-style rewrite of the page; GAP-4 backend service defects incl. per-bridge atomic + audit row + `dry_run`; GAP-5 ledger-health 30s cache). No new scope here.

## Acceptance
- [ ] `/admin/finance/daily-close` loads real ledger health and posts successfully end-to-end.
- [ ] Page reachable from nav/registry; dead link fixed.
- [ ] Dark mode correct; backend returns 400 (not 500) for data problems; close run writes an audit row.

---

# PHASE 3 — Billing & Collections (Smart Collection Engine)

**Authoritative spec: `SOLOPRENEUR_PHASE3_PLAN.md`.** Summary for context only:

- Waterfall: existing advance (toggle, default ON) → oldest unpaid EMIs → oldest pending direct sales → remainder to Customer Advance. **Skip partial EMIs** (surface them in `skipped[]`); partial allowed for direct sales; advance never touches direct sales.
- Backend: `backend/billing/services/smart_collection_service.py` (`plan_` + `execute_`), `SmartCollectionRun` idempotency/audit model, orchestrating existing services only.
- API: `POST /admin/billing/smart-collect/` (`dry_run`, `finance_account_id` required on execute, idempotency key) + `GET /admin/billing/smart-collect/outstanding/?customer_id=`.
- Frontend: `/admin/billing/smart-collect` — search customer → outstanding breakdown → amount + advance toggle → backend-computed live preview → inline confirm → printable receipt; `?customer=` prefill; "Smart Collect" button on customer-list rows (highlight when `hasOutstandings`).
- 10 named pytest scenarios + manual double-post idempotency check.

## Acceptance — the checklist at the end of `SOLOPRENEUR_PHASE3_PLAN.md`.

---

# PHASE 4 — Inventory & Logistics Cockpit

## Goal
One page for the physical side of the business: what's in stock, what must ship today, what came back. Today this spans `/admin/inventory/*`, `/admin/deliveries`, `/admin/service-desk/returns` — three mental contexts for one person.

## What already exists (reuse, don't rebuild)
- Bulk stock-summary aggregation (1799→8 queries fix) — backend summary service.
- Deliveries workspace: `getAdminDeliverySummary` / `getAdminDelivery` (`frontend/src/services/deliveries.ts`), rich `DeliveryRecord` with `action_endpoints`, `blocking_reasons`, `inventory_stock_status`.
- Service-desk returns page with source lookup + auto-fill (recently rebuilt: enter any Direct Sale / Invoice / Subscription / Delivery ID → customer, product, inventory, linked IDs auto-populate).
- `inventory/management/commands/prepare_missing_inventory_profiles.py`.

## Backend

### [NEW] `backend/api/v1/views/admin_logistics_cockpit.py`
```
GET /api/v1/admin/logistics/cockpit/
```
30s-cached aggregate: low-stock items (below reorder threshold — if no threshold field exists on the inventory item/profile model, add nullable `reorder_level` with migration and treat null as "no alert"); deliveries by phase (pending / blocked-stock / dispatched / out-for-delivery today); open return cases by stock_status; purchase requirements open count.

### [NEW] Low-stock check into ledger-health-style checks
Add a `low_stock_count` item to the Phase 1 `action_queue` (same underlying query — share the service function).

## Frontend

### [NEW] `frontend/src/app/(dashboard)/admin/logistics/page.tsx`
`ERPPageShell`, eyebrow "Operations", title "Logistics Cockpit". Three stacked sections, each with count chips and a compact table of the top items + "open full module" link:
1. **Ship today** — deliveries pending/blocked (blocked rows red with `blocking_reasons` inline; row buttons call existing `action_endpoints` where present, else deep-link to `/admin/deliveries`).
2. **Stock alerts** — low/zero stock rows with product, location, qty, deep-link to inventory item + "Create purchase requirement" link if that flow exists in `/admin/purchases`.
3. **Returns in flight** — open service-desk return cases with stock_status PENDING, deep-link to case detail.

### Wiring
`ROUTES.admin.logisticsCockpit`; registry; module-data quick action under Inventory/Deliveries; Phase 1 action queue links here for delivery/stock items.

## Acceptance
- [ ] Cockpit loads in one request; counts match the underlying module pages.
- [ ] Blocked deliveries visibly explain *why* (blocking_reasons shown, not hidden).
- [ ] Low-stock alert appears in both cockpit and Today action queue from one shared query.
- [ ] tsc clean, `manage.py check` clean, migration (if `reorder_level` added) reviewed.

---

# PHASE 5 — CRM & Customer Lifecycle

## Goal
Lead → customer → subscription → fulfillment with zero re-typing, plus a follow-up queue so no lead dies of silence. Much of this shipped recently (lead workflow automation, unified workbench, lead-to-customer mapping page — commits `0328ad51`…`46617b74`). Phase 5 is **consolidation**, not invention.

## Audit-first task for Antigravity
Before coding: verify the recently-deleted pages (`admin/crm/leads/[lead_id]/page.tsx`, `admin/workbench/lead-workflow/page.tsx` are deleted in git status) have replacements that are wired in `admin-route-registry.ts` and nothing links to the dead paths. Fix any dangling links found (same class of defect as Phase 2's GAP-2).

## Backend

### [MODIFY] Follow-up queue endpoint
`GET /api/v1/admin/crm/follow-ups/due/` — leads/customers with next-action date ≤ today (the CRM follow-ups module exists at `/admin/crm/follow-ups`; if the model already has due dates, this is a filter + serializer, not new schema). Feeds Phase 1 action queue.

### [VERIFY] Lead conversion service
`backend/subscriptions/services/lead_conversion_service.py` is modified on this branch — confirm the lead→customer conversion carries phone/address/KYC data forward and writes an audit row; add a pytest covering the conversion happy path + duplicate-phone guard if missing.

## Frontend

### [MODIFY] `/admin/crm/follow-ups` — "Due today" default view
Default filter = due ≤ today, ordered oldest first; row actions: Call (tel: link), Mark done, Snooze (+1/+3/+7 days), Convert → lead workflow. Solopreneur rule: opening the page shows *work*, not a filter form.

### [MODIFY] Customer 360 links
Customer list rows already deep-link to Subscriptions / Outstandings / Payments / Reversals / SD Returns / Smart Collect (Phase 3). Add the same link set to the customer detail page header (`/admin/customers/[id]`) if any are missing — one place to jump anywhere for the customer on the phone.

## Acceptance
- [ ] No dangling links to deleted lead pages; registry entries current.
- [ ] Follow-ups page opens directly on today's due list; snooze/done work.
- [ ] Lead→customer conversion test green.
- [ ] Follow-up count appears in Phase 1 action queue.

---

# PHASE 6 — Reports, Reminders & Automation

## Goal
The app works for the operator while they sleep: reminders dispatch themselves, a daily digest summarizes the business, exports are scheduled, and nothing depends on remembering to click.

## What already exists (build on, don't duplicate)
- `backend/reminders/` app with `management/commands/dispatch_reminders.py` and `/admin/reminders` page.
- `/admin/reports/scheduled-export` page and ~20 report pages under `/admin/reports/*`.
- No Celery — scheduling is OS-level (Windows Task Scheduler locally / cron on the Hostinger VPS via existing deploy pipeline). **Do not introduce Celery/Redis for this** — management commands + OS scheduler is the right size for one operator.

## Backend

### [NEW] `backend/core/management/commands/solopreneur_digest.py`
Builds the same payload as Phase 1's `/solopreneur/today/` (share the service function — single source of truth) plus yesterday's totals, and stores it as a `DailyDigest` row (new small model: date unique, payload JSON, created_at). Optional `--send` flag emails/WhatsApps it later — **v1 only stores it**; the Today page shows "yesterday vs today" deltas from it.

### [NEW] `backend/core/management/commands/solopreneur_healthcheck.py`
Runs ledger-health + low-stock + overdue-EMI checks; exit code non-zero on red findings; writes an `AuditLog` row. Designed for a nightly cron so a failed check is visible in Phase 1's action queue next morning ("Last night's healthcheck: 2 warnings").

### [DOCUMENT] `docs/solopreneur-scheduling.md`
Exact cron lines for the VPS (via existing `deploy.sh` conventions) and Task Scheduler steps for local: nightly `dispatch_reminders`, `solopreneur_digest`, `solopreneur_healthcheck`; weekly DB backup command if one exists (verify `core/management/` for an existing backup command first).

## Frontend

### [MODIFY] Phase 1 Today page
Add "Yesterday" delta chips (from DailyDigest) and "Last healthcheck" status line.

### [MODIFY] `/admin/reminders`
Ensure it surfaces "due today / overdue to dispatch" as default view and shows last `dispatch_reminders` run time (from its audit/log rows) so the operator can *see* automation is alive.

## Acceptance
- [ ] `python manage.py solopreneur_digest` idempotent per date; digest visible on Today page.
- [ ] `solopreneur_healthcheck` exit codes correct (0 clean / non-zero on findings) and result surfaces in the Today action queue.
- [ ] Scheduling doc tested by actually running each command once on the target environment.
- [ ] No new infra dependencies (no Celery/Redis/broker).

---

# Cross-phase final verification (run after all phases)

1. `cd frontend && npx tsc --noEmit` → 0 errors.
2. `cd backend && .venv\Scripts\python manage.py check && .venv\Scripts\python -m pytest tests/ -k "solopreneur or smart_collection" -q` → green.
3. Browser sweep (desktop + dark mode): `/admin/today` → every action-queue link → resolve one item of each type → return to Today → count drops.
4. The "one morning" test: from login, the operator can (a) see today's dues, (b) smart-collect a lump sum, (c) dispatch today's deliveries, (d) run daily close — **without using the module launcher once**.

# File inventory (everything Antigravity creates/modifies)

**Backend new:** `billing/services/smart_collection_service.py` · `api/v1/views/admin_smart_collection.py` + route · `api/v1/views/admin_solopreneur_today.py` + route · `api/v1/views/admin_logistics_cockpit.py` + route · `core/management/commands/solopreneur_digest.py` · `core/management/commands/solopreneur_healthcheck.py` · migrations: `SmartCollectionRun`, `DailyDigest`, (maybe) `reorder_level`.
**Backend modified:** `accounting/services/solopreneur_finance_service.py` (GAP-4) · `api/v1/views/admin_solopreneur_finance.py` (GAP-4/5) · `api/v1/urls.py` (3 new includes) · CRM follow-ups view.
**Frontend new:** `services/smart-collection.ts` · `services/solopreneur.ts` · `app/(dashboard)/admin/billing/smart-collect/page.tsx` · `app/(dashboard)/admin/today/page.tsx` · `app/(dashboard)/admin/logistics/page.tsx`.
**Frontend modified:** `services/accounting.ts` (GAP-1) · `app/(dashboard)/admin/finance/daily-close/page.tsx` (GAP-3) · `lib/routes.ts` · `config/admin-route-registry.ts` · `config/admin-module-data.ts` (incl. GAP-2 dead link) · `app/(dashboard)/admin/customers/page.tsx` (Smart Collect button/lane) · customer detail header links · `/admin/crm/follow-ups` page · `/admin/reminders` page · `lib/api/index.ts` (`isPaymentCollectionMutation` + smart-collect path).
**Docs:** `docs/solopreneur-scheduling.md`.
