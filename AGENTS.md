# AGENTS.md

## Project Identity

This repository contains the production system for **SUBIDHA CORE – Lucky Plan EMI System**.

This is not a demo app.
It must work under real furniture retail business conditions.

Primary business today:
- Lucky Plan EMI subscription management
- Customer enrollment
- Product and batch management
- EMI schedule generation
- Payment collection and reconciliation
- Lucky draw workflow
- Admin, partner, and customer access
- Furniture rental (LIVE)
- Furniture leasing (LIVE)
- Direct Sales and Billing (LIVE)

Future expansion:
- Manufacturer-to-customer marketplace

All changes must preserve backward compatibility for current Lucky Plan EMI data and workflows.

---

## Canonical project rulebook

Before changing backend, frontend, workflows, financial logic, UI routes, models, serializers, services, tests, or deployment behavior, read:

`docs/SUBIDHA_CORE_PROJECT_RULEBOOK.md`

This rulebook is the canonical business + technical reference for SUBIDHA CORE. It defines business invariants, financial controls, audit rules, backend/frontend boundaries, role rules, upgrade rules, deletion rules, and release checks.

---

## Core Product Rules

1. One customer may have multiple subscriptions.
2. One customer may hold multiple Lucky IDs across different products or batches.
3. Each subscription is financially independent.
4. EMI records must be auditable and never silently altered.
5. Payment history is append-only in spirit:
   - prefer reversal/adjustment entries over destructive mutation
   - preserve auditability
6. Lucky draw logic must not corrupt payment logic.
7. Winning a draw may waive future EMI obligations only according to business rules;
   never retroactively modify already-settled payments.
8. Product delivery state, contract state, payment state, and draw state are separate concerns.
9. Schema evolution must be additive and non-breaking unless explicitly approved.
10. The system must remain extensible for future RENT and LEASE plans.

---

## Architecture Expectations

Use the approved full-stack architecture.

### Backend
Approved stack:
- Django
- Django REST Framework
- PostgreSQL
- JWT auth
- Service-oriented business logic
- Clear separation:
  - models
  - serializers
  - services
  - views / routes
  - permissions
  - audit / reconciliation logic

### Frontend
Approved stack:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form where forms are complex
- Zod validation where appropriate
- Role-based dashboard layouts

### Architecture rules
- Do not restart architecture.
- Do not suggest FastAPI or any backend framework replacement unless the owner explicitly approves a breaking architecture migration.
- Keep `/api/v1` stable.

### Roles
Support these roles cleanly:
- Admin
- Partner
- Customer
- Public visitor

Never mix role permissions casually in frontend or backend.

---

## Non-Negotiable Engineering Rules

1. Do not break existing APIs unless explicitly instructed.
2. Do not rename fields casually if existing data or frontend depends on them.
3. Before changing models, evaluate:
   - migration impact
   - existing subscription data impact
   - EMI calculation impact
   - reconciliation impact
   - future rental/leasing compatibility
4. Prefer additive migrations:
   - new nullable columns
   - new tables
   - new enums with backward-safe defaults
5. Never hardcode business values that may later become configurable.
6. Avoid fat components and fat views.
7. Put domain logic in services, not scattered across UI or route handlers.
8. Write defensive code for nulls, partial records, and malformed API data.
9. Optimize for operational simplicity for store staff.
10. Keep UI enterprise-grade but practical, not decorative.

---

## Domain Modeling Guidance

Keep these domains conceptually separate:

- Customer
- Partner
- Product
- Batch
- Lucky ID
- Subscription / Contract
- EMI Schedule
- Payment
- Waiver / Winner Benefit
- Financial Ledger
- Delivery / Fulfillment
- Audit Log

Never collapse these concepts into one overloaded table or one oversized frontend page model.

---

## Lucky Plan Business Logic Guidance

When implementing Lucky Plan behavior:

- Subscription creation must validate:
  - customer
  - product
  - batch
  - tenure
  - monthly amount
  - total contract amount
  - lucky ID uniqueness within scope
- EMI schedule generation must be deterministic and reproducible.
- Payment posting must update EMI status safely.
- Reconciliation must detect mismatches between:
  - subscription total
  - EMI total
  - collected payments
  - waived amounts
  - outstanding balance
- Draw winner processing must be idempotent.
- Admin actions that affect money must be logged.

If uncertain, preserve data and auditability over convenience.

---

## Frontend UX Guidance

Build for daily operational use by non-technical staff.

### UX principles
- Fast page load
- Clear tables
- Clear filters
- Strong search
- Safe forms
- Confirmation for destructive actions
- Readable status badges
- Mobile-friendly where practical, desktop-first for admin
- Avoid clutter

### Admin UX priorities
- Dashboard with operational KPIs
- Search-first workflows for large datasets
- Bulk-safe but controlled admin actions
- Clear detail pages for customer, subscription, payment, batch, draw
- Audit visibility
- Reconciliation visibility

### Form design
- Prefer searchable selectors over huge dropdowns
- Autofill known linked fields when safe
- Show derived values clearly
- Validate before submit
- Show exact backend error messages in readable form

---

## Code Change Policy for AI Agents (Claude, Codex, etc.)

When making changes:

1. **Use Existing Files First**: Do not create new files at first. Always inspect the existing codebase and reuse existing files, services, components, and patterns where reasonable.
2. **Additive Improvements**: Prefer additive improvements on existing files, services, and tests. Check existing paginations and structures, and add to them rather than replacing or creating new ones.
3. **Document New Needs**: If creating a new file or service is absolutely necessary, it **must** be explicitly documented.
4. **Document All Updates**: All new updates and improvements must always be documented in the relevant artifact or summary.
5. If architecture is weak, improve it incrementally without destabilizing working flows.
6. Prefer small, reviewable diffs.
7. For larger work, stage changes in vertical slices:
   - schema / backend
   - API
   - frontend integration
   - validation
   - testing
8. Do not generate placeholder logic and call it complete.
9. Do not leave dead code or duplicate components unless explicitly transitional.
10. If creating new files (after justifying the need), place them in the correct architectural boundary.
11. If changing a public interface, update all affected usage points.

---

## Required change review summary

For every completed change, include this summary:

- Existing data impact
- Financial integrity impact
- Auditability impact
- Daily shop usability impact
- Future rent/lease compatibility impact
- API contract impact
- Migration impact
- Test coverage
- Role/permission impact
- Reconciliation/accounting impact
- Rollback/deployment notes

---

## Testing Expectations

For backend changes, include:
- serializer/schema validation coverage
- service-layer tests
- reconciliation/business rule tests
- permission tests where relevant

For frontend changes, include:
- loading state
- empty state
- error state
- success state
- defensive handling of partial API payloads

When feasible, add tests. If tests are not added, explain the risk.

---

## Output Expectations

When completing a task, always report:
1. What changed
2. Why it changed
3. Impact on existing data
4. Impact on EMI logic
5. Impact on future rental/leasing extensibility
6. Any migration or deployment caution

---

## What to Avoid

Do not:
- rewrite the whole project without need
- replace working business rules with generic SaaS assumptions
- introduce breaking schema changes casually
- move financial logic into frontend
- use mock data in production paths
- hide business-critical assumptions
- overengineer with unnecessary microservices

---

## Preferred Working Style

For major tasks:
1. inspect relevant files first
2. propose the minimal correct architecture
3. implement in production-ready form
4. preserve backward compatibility
5. explain tradeoffs clearly

## Imported Claude Cowork project instructions

# SUBIDHA CORE — Claude Instructions

## Permanent UI priority

Admin / Superuser / Owner UI must be desktop-first ERP/POS/control-room style.

Customer / Partner / Vendor / Staff / Public UI must be mobile-first.

Do not migrate to Vite or any other framework. Keep Next.js App Router + React + TypeScript.

Read before frontend UI work:
- docs/admin-ui/subidha_admin_desktop_ui_priority_handover.md

## Backend safety

Do not change backend financial logic unless explicitly requested.

Never change EMI calculation, Lucky Plan draw, winner waiver, payment posting, receipt generation, invoice generation, accounting bridge, journal creation, stock ledger, reconciliation, commission, payout, deposit/refund, rent/lease lifecycle, or direct sale finalization without explicit approval.

## Frontend rules

Use real backend APIs only.
Do not invent endpoints.
Do not invent fields.
Do not create fake operational UI.
Do not add dead buttons.
Do not calculate financial truth in frontend.

## Admin UI rule

Admin routes use desktop shell:
- dense workbench
- data grid
- command bar
- right inspector
- drawer-based create/edit
- print/export/peripheral actions
- keyboard shortcuts

## Non-admin UI rule

Customer, partner, vendor, staff, and public routes use mobile-first shells:
- cards
- bottom navigation where useful
- large touch targets
- simple forms
- no dense admin grids

## Validation

For frontend changes run:
cd frontend
npm run check:routes
npm run typecheck
npm run lint
npm run build:smoke

For backend changes run relevant Django tests.

Always report:
- files changed
- routes added/hidden
- backend endpoints used
- test results
- risks

## Solopreneur / Single Admin Rule

The business is operated by a single owner/admin acting as a "solopreneur."
- The main **Admin Webapp** (desktop) must serve as the universal control center.
- The admin must have frictionless access to **all modules** (finance, stock, inventory, money, collections, CRM, subscriptions) without excessive department-based segregation or artificial roadblocks.

---

## Local Dev Harness & Verification Workflow

This is the single, self-contained reference for booting the app, using dev data
safely, and verifying a change. Follow it instead of re-deriving commands each
session — it keeps working context small.

### 1. Stack facts (do not re-discover)

| Piece | Value |
| --- | --- |
| Backend | Django, `backend/manage.py`, runs on **:8000** |
| Backend venv | `backend/.venv/Scripts/python.exe` (Windows) |
| Dev settings | `core.settings.development` (default; `DEBUG=True`) |
| Test settings | `core.settings.test` (auto-selected when running tests) |
| Dev database | **PostgreSQL** `subidha_core` @ `127.0.0.1:5432` (real dev data) |
| DB config source | `DATABASE_URL` in `backend/.env`, auto-loaded by `core/settings/base.py` |
| Frontend | Next.js, `frontend/`, runs on **:3000** |
| Frontend → API | Falls back to `http://127.0.0.1:8000/api/v1` (no env override needed for local) |

### 2. Booting the servers

**Preferred (in-app browser preview):** use the `.claude/launch.json` configs —
start `backend` and `frontend` via the preview tool, never a raw shell dev server.
This gives console/network/log capture for verification.

Manual equivalents (if launching outside the harness):

```
# Backend (from repo root)
backend/.venv/Scripts/python.exe backend/manage.py runserver 8000

# Frontend
npm --prefix frontend run dev      # http://localhost:3000
```

The backend reads `backend/.env` automatically, so Postgres dev data is live on
boot — no extra flags. If `DATABASE_URL` is unset, base settings fall back to a
local `db.sqlite3`; for real dev work keep `DATABASE_URL` pointed at `subidha_core`.

### 3. Using real dev data SAFELY

The dev Postgres DB (`subidha_core`) holds real working test data. Treat it as
mutable-but-precious:

- **READ freely.** Browse the running app, hit read endpoints, query via
  `manage.py shell` / `dbshell` to confirm state.
- **WRITE only through the app's own flows** (admin UI, documented API endpoints,
  or management commands). Never hand-edit rows to "fix" a test.
- **Honor the append-only financial invariants** (see Core Product Rules): prefer
  reversal/adjustment entries; never destructively mutate EMI or settled payments.
- **Never run destructive scripts against dev without asking** — e.g.
  `clear_operational_data.py`, `reset_script.py`, `sync_and_reset.py`, `flush`,
  `migrate zero`, or dropping/recreating the DB. These wipe working data.
- **Never deploy the dev DB to production.** Production is bootstrapped from a
  config-only fixture (see `project_production_bootstrap`); dev data is test data.
- For throwaway experiments that need writes, run against **test settings**
  (isolated sqlite) instead of touching `subidha_core`.

### 4. Verifying a change (do this before claiming "done")

Run only the gate matching what you touched — don't run the full suite for a
one-line change.

**Frontend changes:**
```
cd frontend
npm run typecheck        # tsc --noEmit — the fast primary gate
npm run check:routes     # if routes/registry touched
npm run lint             # if asked or for larger diffs
npm run build:smoke      # before a release-level change only (slow)
```

**Backend changes:**
```
backend/.venv/Scripts/python.exe backend/manage.py check
backend/.venv/Scripts/python.exe backend/manage.py makemigrations --check --dry-run
backend/.venv/Scripts/python.exe backend/manage.py test <app.tests.Target>   # scoped
```
Note: the full backend test suite has ~20 known pre-existing failures and is NOT
the gate — run the tests scoped to what you changed.

### 4d. Payment/collection service call rules (verified 2026-08-20)

These rules were discovered when the `smart_collection_service` was found
completely broken due to post-refactor field/signature drift:

- `record_emi_payment()` uses `method=` (not `payment_method=`), `note=` (not
  `notes=`), and returns a **dict** `{payment, emi, subscription, ...}` — not a
  Payment model instance.
- `collect_direct_sale_payment()` does NOT accept `payment_method` — the method
  is derived from the finance account kind. It requires a linked `BillingInvoice`.
- `CustomerAdvanceService.collect_unapplied_advance()` uses `method=`, `note=`,
  and REQUIRES `payment_date`.
- `CustomerAdvance` model fields are `amount` and `unapplied_amount` (not
  `total_received` / `unapplied_balance`).
- `Emi.is_paid` was removed; use `status__in=[EmiStatus.PENDING, EmiStatus.OVERDUE]`
  for unpaid EMIs, or `status == EmiStatus.PAID` for paid.
- `Customer.full_name` was removed; use `.name`.
- `FinancialLedger.payment` is a **OneToOneField** — reversal entries use
  `payment=None` and store the reversed payment ID in `allocation_context`.
- Winner subscription status is `WON`, not `COMPLETED` — `is_winner` takes
  priority over `SETTLED_EMI_STATUSES` in `resolve_expected_subscription_status`.
- Test fixtures must call `ensure_test_collection_purpose_mapping(finance_account=...)`
  or use `create_payment_collection_finance_account()` — inline
  `FinanceAccount.objects.create()` won't have COA mappings and will raise
  `FinanceAccountPostingReadinessError`.

**End-to-end (behavioral) verification — required for anything the browser can
render:** boot the servers via `.claude/launch.json`, drive the actual flow in the
in-app browser, and read console/network/server logs to confirm no errors. Share a
screenshot or the relevant log lines as proof. Do not ask the owner to check
manually.

### 4b. Never create a duplicate admin page (mandatory pre-flight)

The `/admin` tree has 450+ pages and a history of the same feature being built at
several routes (e.g. `collect` / `collections` / `collection-center`;
`reversals` / `reversal-workbench` / `reversal-control`; `products` /
`pim/products`). Root cause: agents scaffold a new route without checking what
already exists. Before creating ANY admin page:

1. Search existing routes for the concept **and its synonyms**
   (collect/collection, reversal/void/return, vendor/supplier, staff/employee):
   ```
   ls frontend/src/app/(dashboard)/admin  # then grep for the concept
   ```
2. Check the canonical route for that domain in
   `frontend/src/config/admin-route-registry.ts`.
3. Run `npm --prefix frontend run check:routes` — part of every route change.
4. If a page already covers the job, **extend it or add a redirect alias**
   (`redirect()` or `redirectToCanonicalPath()`) — do NOT create a new route.

There are already 62 redirect aliases cleaning up past duplicates. Do not add to
the pile. When in doubt, ask the owner which route is canonical.

### 4c. Consolidating existing duplicates — ADDITIVE MERGE ONLY (never delete)

Duplicate admin pages are NOT to be deleted. Each duplicate route often carries
live workbench actions and workflows; deleting one destroys real functionality.
Duplication originates in the backend (different modules own different route trees
— e.g. the subscription module owns `/admin/products`, the product module owns
`/admin/pim/products`). Consolidate on the frontend additively:

**The canonical pattern (already implemented in `/admin/products`):**
- Pick ONE canonical page per concept (the richest / most-used route).
- Inside it, add a **tab switcher**; render each duplicate's workflow as a tab
  panel under a single shared `ERPPageShell`. Every action from every duplicate
  page must be reachable from the canonical page — full actions inline, not just
  links out. (`/admin/products` = "Subscription Products" tab + embedded `PimPanel`
  = "PIM Products" tab; both services coexist, zero features lost.)
- Extract each duplicate's body into a reusable component/panel so the original
  route can keep rendering it too — the old route stays alive.
- Only AFTER the owner confirms the merged page covers everything may an old route
  be converted to a redirect alias (see §4b) — and even then, prefer keeping it.

**Never** delete a page, remove a workbench, or drop an action during a merge.
Merge is additive: consolidate access, preserve every workflow.

### 5. Always report (keeps context lean)

- files changed
- routes added/hidden, backend endpoints used
- which verification gates ran + their result
- any dev-data writes made and how (which flow)
- residual risks
- Assume the admin is trusted to control all operational fields single-handedly. Optimize the Admin UI for speed, comprehensive visibility, and unified operations.


### 4e. Financial Reporting & KPI Rules (verified 2026-08-20)
- **Dynamic Ledger Mapping**: The KPI aggregation in the frontend/backend must dynamically lookup `FinanceAccountCoaMapping` rather than assuming a single `chart_account` attached to a `FinanceAccount`. Payments made to mapped accounts (like `UPI_COLLECTION`) must accurately roll up into the "Balance held" and "Total Liquid Balance" for their parent settlement accounts.
- **Cosmetic Data**: No cosmetic test data is allowed in the development database. It breaks the dashboard and KPI reporting. Operations must only use valid real-world records.

### 4f. Manufacturing Labor & Payroll Rules (verified 2026-08-20)
- **Manufacturing Labor**: Manufacturing labor costs must be aggregated using `ProductionLaborLine` and must trigger `manufacturing_labor_accrual` to bridge into the accounting ledger (credit `Salary Payable`, debit `WIP`). 
- Labor must be fully posted before a production job can be completed.
- Unposted `ProductionLaborLine` records for an employee must be pulled during their monthly salary sheet generation.

### 4g. Data Migration & Legacy Receivables (verified 2026-08-20)
- `CustomerOpeningOutstanding` records (Legacy Receivables) imported from batches must be strictly linked to their `MigrationStagingRow` via `migration_row` ForeignKey.
- Admin UI and Customer Profiles must expose the `migration_batch_number` so operators can trace legacy receivables back to the exact migration batch that generated them.

