# Admin UI / Backend Module Improvement Roadmap

This roadmap migrates SUBIDHA CORE from a wide route-heavy admin app into a categorized, role-safe, module-owned ERP system.

All phases are additive by default. Do not remove or break existing operational routes until replacement routes are live, tested, and aliased.

## Global safety contract

- Preserve existing data and database semantics.
- Do not change EMI calculation.
- Do not change payment posting or receipt generation semantics.
- Do not weaken lucky draw winner waiver controls.
- Do not auto-create journals, money movements, payments, receipts, stock movements, salary payments, payout records, or reconciliation rows from navigation or profile cleanup.
- Accounting bridge posting remains explicit, idempotent, auditable, and controlled.
- New canonical routes must start as aliases/thin shells before migrating page logic.
- Backend changes should be service-layer first; route/view changes should stay thin.

## Phase 0 — Taxonomy and route audit

| Area | Detail |
|---|---|
| Goal | Establish route ownership and canonical module taxonomy before moving files. |
| Files affected | `docs/architecture/admin-module-taxonomy.md`, `docs/architecture/admin-route-migration-map.md`, `frontend/src/config/admin-module-taxonomy.ts` |
| Backend changes | None |
| Frontend changes | Metadata/config only |
| Risk | Low |
| Test requirements | `npm run typecheck`, `npm run lint` |
| Deployment notes | No migration |

### UI outcome

No visible page redesign yet. This phase gives Codex/Claude an operating map.

## Phase 1 — Navigation registry v2

| Area | Detail |
|---|---|
| Goal | Sidebar and top navigation grouped by real modules, not scattered route families. |
| Files affected | `frontend/src/config/navigation.ts`, `frontend/src/config/admin-route-registry.ts`, `frontend/src/components/layout/DashboardShell.tsx` if needed |
| Backend changes | None |
| Frontend changes | New module grouping, module landing links, aliases preserved |
| Risk | Low-medium |
| Test requirements | Typecheck, lint, route smoke for all admin groups |
| Deployment notes | No migration |

### UI outcome

Sidebar groups should become:

```text
Command Center
Profiles & Parties
CRM & Requests
Sales & Contracts
Lucky Plan Control
Collections & Cashier
Finance Operations
Accounting & Reconciliation
Inventory & Stock
Purchases & Vendors
Delivery & Service
HR & Staff
BI & Reports
Settings & Governance
```

## Phase 2 — Profiles & Parties module

| Area | Detail |
|---|---|
| Goal | Create canonical object cockpits for customers, partners, vendors, staff, branches, parties. |
| Files affected | Profile routes/pages, route aliases, profile services |
| Backend changes | Add read-only profile aggregation endpoints only if needed |
| Frontend changes | Object cockpit shells with linked records, risk, documents, timeline |
| Risk | Medium |
| Test requirements | Route aliases, profile load, no financial mutation tests |
| Deployment notes | No migration unless explicit additive profile fields are approved |

### UI pattern

Each profile page uses:

```text
Header
Risk/status cards
Linked contracts/requests
Money posture
Documents/KYC
Timeline/audit
Allowed actions only
```

## Phase 3 — Sales, subscriptions, and Lucky Plan split

| Area | Detail |
|---|---|
| Goal | Separate Sales, Subscriptions, Rent/Lease, and Lucky Plan into clear modules. |
| Files affected | Subscription pages, batch/lucky/draw pages, route aliases |
| Backend changes | Prefer none; only add read-only readiness summaries if missing |
| Frontend changes | Lucky Plan route aliases and control-room object pages |
| Risk | Medium |
| Test requirements | Advance EMI/rent/lease route smoke; lucky draw workflow tests remain unchanged |
| Deployment notes | No migration |

### UI pattern

Lucky Plan pages use audit-first control-room design:

```text
Batch readiness
Lucky ID grid 00-99
Draw evidence
Winner/waiver state
Audit timeline
```

## Phase 4 — Finance vs Accounting split

| Area | Detail |
|---|---|
| Goal | Separate source-money operations from ledger/accounting operations. |
| Files affected | Finance pages, accounting pages, reconciliation aliases, service clients |
| Backend changes | Add read-only finance/accounting status endpoints where missing |
| Frontend changes | Finance Operation cockpit and Accounting Control cockpit |
| Risk | Medium-high |
| Test requirements | Collection, deposit, commission, payout, bridge posting, reconciliation tests |
| Deployment notes | No migration unless approved additive status fields are needed |

### UI rule

Finance answers:

```text
Who owes money? Who gets money? What came in/out? What is pending?
```

Accounting answers:

```text
Which ledger account? Which journal? Which period? Which bridge state? Which reconciliation evidence?
```

## Phase 5 — Inventory + purchase + vendor chain

| Area | Detail |
|---|---|
| Goal | Connect vendor procurement to stock and finance without hidden side effects. |
| Files affected | Inventory, purchase, vendor pages and services |
| Backend changes | Add read-only chain status APIs if required |
| Frontend changes | Vendor → PO → receipt → stock → bill → payable → payment → accounting timeline |
| Risk | High |
| Test requirements | Purchase receipt stock movement, purchase bill payable, vendor payment, accounting bridge |
| Deployment notes | No migration unless additive source-link fields are approved |

## Phase 6 — CRM, requests, and service desk

| Area | Detail |
|---|---|
| Goal | Consolidate customer/partner/vendor/public requests into clear queues. |
| Files affected | CRM, support, online enquiry, subscription request pages |
| Backend changes | Add read-only request summary endpoints if needed |
| Frontend changes | Request inboxes with source, owner, status, next action |
| Risk | Medium |
| Test requirements | Request route smoke; no silent contract/payment creation |
| Deployment notes | No migration |

## Phase 7 — HR and staff separation

| Area | Detail |
|---|---|
| Goal | Keep staff profile, attendance, payroll setup, salary payment, and payroll accounting separate. |
| Files affected | HR/staff/payroll/salary payment pages |
| Backend changes | Additive onboarding state only if approved |
| Frontend changes | Staff object page, payroll setup, salary sheet/payment timeline |
| Risk | Medium |
| Test requirements | Staff creation no accounting side effects; salary payment controls |
| Deployment notes | Migration only if `ONBOARDING` enum/fields are approved |

## Phase 8 — BI and business optimization

| Area | Detail |
|---|---|
| Goal | Add read-only decision dashboards with links to source records. |
| Files affected | BI/report pages and services |
| Backend changes | Read-only aggregate endpoints only |
| Frontend changes | Profitability, cashflow, inventory aging, customer risk, partner/vendor performance |
| Risk | Medium |
| Test requirements | Read-only endpoint and route tests |
| Deployment notes | No source mutation |

## Phase 9 — Clean repo and remove duplicates

| Area | Detail |
|---|---|
| Goal | Remove dead UI, stale aliases, duplicate routes, fake actions, and unused services after migration. |
| Files affected | Route aliases, old pages, deprecated service clients, tests |
| Backend changes | Remove only deprecated endpoints after confirmed zero usage |
| Frontend changes | Delete stale pages only after alias period |
| Risk | High |
| Test requirements | Full backend tests, frontend typecheck/lint/build, Playwright route smoke |
| Deployment notes | Requires explicit approval before deletion |

## Efficient Claude prompt to execute the plan

Use this prompt in Claude/Codex for each phase. Replace `{PHASE_NUMBER}` and `{PHASE_SCOPE}`.

```text
You are working on SUBIDHA CORE – Lucky Plan EMI System.

Repo/branch:
- Work only on branch update.
- Do not auto-commit unless explicitly told.

Approved stack:
- Backend: Django + DRF + PostgreSQL + JWT
- Frontend: Next.js App Router + TypeScript + Tailwind + shadcn/ui

Core constraints:
- Additive and non-breaking only.
- Do not restart architecture.
- Do not change EMI calculation, lucky draw winner waiver rules, payment posting, receipt generation, payout, commission, reconciliation, or audit semantics.
- Do not create fake UI, fake readiness, fake routes, dead buttons, or hidden backend side effects.
- Existing routes must keep working through aliases/redirects until explicitly approved for deletion.
- Backend business logic must stay in services where possible.
- Accounting bridge posting must remain explicit, idempotent, balanced, auditable, and controlled.
- No staff/profile/settings/navigation cleanup may create JournalEntry, MoneyMovement, Payment, ReceiptDocument, SalaryPayment, StockLedger, AccountingBridgePosting, ReconciliationItem, Commission, or Payout records unless that workflow already explicitly does so.

Context files to read first:
- docs/architecture/admin-module-taxonomy.md
- docs/architecture/admin-route-migration-map.md
- docs/architecture/admin-ui-phase-roadmap.md
- frontend/src/config/admin-module-taxonomy.ts
- frontend/src/config/admin-route-registry.ts
- frontend/src/config/navigation.ts
- frontend/src/lib/routes.ts

Current task:
Implement Phase {PHASE_NUMBER}: {PHASE_SCOPE}

Required workflow:
1. Inspect current files before editing.
2. List exact gaps found.
3. Make minimal targeted patches.
4. Preserve existing API contracts unless adding backward-compatible fields/endpoints.
5. Add route aliases before moving pages.
6. Add loading/error/empty states where UI is touched.
7. Add tests for changed backend behavior.
8. For frontend, do not invent endpoints or fields unsupported by backend.
9. Explain impact on:
   - existing data
   - financial integrity
   - auditability
   - daily shop usability
   - future rent/leasing compatibility

Phase-specific output required:
- Root cause
- Files changed
- API contract changes
- UI behavior changes
- Migration notes
- Test cases added/needed
- Risks
- git status --short
- git diff --stat

Validation commands:
cd backend
source .venv/bin/activate
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run

cd ../frontend
npm run typecheck
npm run lint
npm run build:smoke

Do not proceed to the next phase if validation fails.
```

## UI component direction per page family

| Page family | UI structure |
|---|---|
| Dashboard/Command | Role center, work queues, KPI portlets, exception-first layout |
| Profile pages | SAP/Fiori object page: header, linked records, timeline, safe actions |
| Collection pages | POS-speed layout: search, due amount, collect, receipt, duplicate warning |
| Accounting pages | Audit-first layout: mapping, journal, period, bridge, reconciliation, read-only evidence |
| Inventory pages | Stock posture, allocation, movement ledger, reservation/hold status |
| Purchase pages | Document chain: request → order → receipt → bill → payable → payment |
| Lucky Plan pages | Control-room: 00-99 Lucky ID grid, draw readiness, winner evidence |
| HR pages | Profile + onboarding + attendance + payroll setup, no payroll auto-posting |
| BI pages | Read-only charts with source drill-down and no mutation buttons |
