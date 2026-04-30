# Operations Hub UI Rollout

## Design system summary

- Kept Next.js App Router, existing auth/session/middleware flow, and role-based route boundaries unchanged.
- Continued using Tailwind + shadcn-compatible tokens, with additive semantic tokens in `globals.css`:
  - `--success`, `--warning`, `--danger`, `--info` (+ foreground pairs)
  - existing sidebar/workspace token model retained.
- Added shared operations primitives in `src/components/ui/operations.tsx`:
  - `DataTableShell`
  - `FormSection`
  - `KpiCard`
  - `WorkflowCard`
  - `QuickActionGrid`
  - `DetailPanel`
  - `Timeline`

## Components created/updated

### Created

- `src/components/ui/operations.tsx`

### Updated

- `src/app/globals.css` (semantic status tokens, non-breaking)
- `src/app/(dashboard)/admin/hr/staff/page.tsx`
- `src/app/(dashboard)/admin/hr/staff/[id]/page.tsx`
- `src/app/(dashboard)/admin/hr/staff-documents/page.tsx`

## Pages migrated

### Admin

- HR staff register:
  - KPI row + workflow card
  - form section shell for filters/create-edit
  - table shell for staff register list
- HR staff profile:
  - detail header panel + KPI/action strip
  - standardized detail/document/payroll/attendance sections
  - timeline-style deferred audit panel (no fabricated data)
- HR staff documents:
  - KPI row + workflow card
  - standardized filter/upload sections
  - polished table shell

### Cashier

- No direct page migration in this pass.

### Customer

- No direct page migration in this pass.

### Partner

- No direct page migration in this pass.

### Public/Auth

- No direct page migration in this pass.

## Remaining pages not migrated

- Most Admin, Cashier, Customer, Partner, and Public/Auth pages still need the same shared component pass.
- Recommended rollout order:
  1. Admin operations, collections, payments, overdue EMI
  2. Cashier collection/payment pages
  3. Customer subscriptions/payment history/profile
  4. Partner commissions/payouts/collections
  5. Public/Auth consistency touch-up

## Role navigation notes

- No role visibility logic changed.
- Existing `DashboardShell`/`RoleSidebar` role scoping and active-state behavior preserved.

## Known limitations

- HR audit timeline endpoint not yet exposed; UI intentionally shows a truthful deferred state.
- Staff document verify/reject statuses are not available from backend model; UI keeps that action disabled.
- Counter assignment details are still not exposed in the current staff profile API.

## Fake/dead UI removed

- None deleted in this pass.
- Existing “unavailable” actions/messages were kept where backend capability is absent to avoid implying fake support.

## Compatibility notes

- No API contract changed.
- No backend financial, ledger, reconciliation, draw, or payout logic touched.
- No route URL changed.
- All updates are additive and backward compatible.

## Pass 2 — Collections, EMI, and Cashier Rollout

### Pages migrated

- `src/app/(dashboard)/admin/collections/page.tsx`
- `src/app/(dashboard)/admin/emis/overdue/page.tsx`
- `src/domains/payments/pages/AdminPaymentCollectPage.tsx`
- `src/app/(dashboard)/cashier/collect/page.tsx`

### Components used

- `DataTableShell`
- `FormSection`
- `KpiCard`
- `WorkflowCard`
- `QuickActionGrid`
- `DetailPanel`

### Rollout notes

- Kept all existing page routes, existing search/query behavior, and current service calls.
- Preserved all payment/collection form IDs, key button labels, and existing smoke-critical headings.
- Replaced duplicated local section/card visual wrappers with shared operations primitives.
- Improved financial visibility (amount/paid/balance/outstanding) through consistent card/table shells and clearer hierarchy.

### Fake/dead UI removed

- No fake data or fake counters introduced.
- Removed duplicated one-off presentation wrappers (`KpiCard`, `SectionCard`, `StatCard`) where shared primitives now cover the same real workflow surfaces.
- Kept compatibility controls and route links intact.

### Remaining blockers

- `admin/finance/collect` continues to depend on dense domain form logic in one file; splitting into smaller form sub-sections/components would further improve maintainability.
- Collections and overdue pages still use custom row renderers/tables in parts of the flow; could be further standardized with shared table helper variants.

### Backend/API changes

- none

### Migrations

- none

### Test results

- `cd frontend && npm run lint` — passed
- `cd frontend && npm run typecheck` — passed
- `cd frontend && npm run build` — passed
- `cd frontend && npm run test:e2e:smoke` — passed
- `cd .. && bash scripts/run-release-candidate.sh` — passed

## Pass 3 — Payment Detail and History Rollout

### Pages migrated

- `src/app/(dashboard)/admin/payments/page.tsx`
- `src/app/(dashboard)/admin/payments/[id]/page.tsx`
- `src/app/(dashboard)/cashier/payments/page.tsx`
- `src/app/(dashboard)/cashier/payments/[id]/page.tsx`

### Shared primitives used

- `DataTableShell`
- `FormSection`
- `KpiCard`
- `WorkflowCard`
- `QuickActionGrid`
- `DetailPanel`
- `Timeline`

### Rollout notes

- Preserved all route URLs and existing service payload/query behavior for admin and cashier payment routes.
- Kept real payment fields intact: payment id/reference, customer, subscription/lucky/EMI context, amount, method, status, collector/verifier, and timeline/audit metadata.
- Improved readability and surface consistency by replacing ad-hoc section/card wrappers with shared operations primitives.
- Kept real reversal action flow unchanged; only presentation was updated to better separate risk-bearing action context.

### Fake/dead UI removed

- Removed local duplicate visual wrappers in payment pages in favor of shared operations primitives.
- Removed stale icon imports in admin payment register after primitive migration.
- No fake stats, timeline events, or receipt controls were introduced.

### Remaining blockers

- Admin payment detail timeline still relies on generic metadata flattening for heterogeneous backend event payloads; typed timeline event rendering can be improved when backend event shape contracts are formalized.
- Cashier payment detail still carries legacy `DetailSection` wrappers around migrated primitives for compatibility with receipt page structure.

### Backend/API changes

- none

### Migrations

- none

### Test results

- `cd frontend && npm run lint` — passed
- `cd frontend && npm run typecheck` — passed
- `cd frontend && npm run build` — passed
- `cd frontend && npm run test:e2e:smoke` — passed
- `cd .. && bash scripts/run-release-candidate.sh` — passed

## Pass 4 — Reconciliation and Finance Review Rollout

### Pages / components migrated

- `src/app/(dashboard)/admin/reconciliation/page.tsx` (canonical `/admin/reconciliation` and `/admin/finance/reconciliation` re-export)
- `src/app/(dashboard)/admin/finance/page.tsx` (finance control center KPI shells, quick lanes, settlement posture)
- `src/components/admin/Phase5ReportSurface.tsx` (used by `admin/reports/reconciliation` and other Phase 5 report routes)
- `src/app/(dashboard)/admin/reports/page.tsx` (reconciliation posture follow-up list in reports overview)

### Shared primitives used

- `DataTableShell`
- `DetailPanel`
- `FormSection`
- `KpiCard`
- `QuickActionGrid`
- `StatusBadge` (existing component; payment queue state column and finance settlement rows)

### Rollout notes

- Reconciliation workspace: subscription and payment queue tables wrapped in `DataTableShell`; summary KPIs use `KpiCard`/`QuickActionGrid`; section shells use `DetailPanel` for scan-heavy blocks.
- Finance control center: `MetricCard` now composes `KpiCard` (preserves all hrefs and API-derived values); section shells route through `FormSection`; reconciliation-adjacent KPI rows use `QuickActionGrid`.
- Reports: flagged reconciliation drill-down links use `DataTableShell` for consistent table framing; Phase 5 BI report shell uses `FormSection` instead of ad-hoc workspace section styling.
- Filters, data loaders, CSV export columns, and flag/reconcile behaviors are unchanged.

### Fake/dead UI removed

- Removed local `WorkspaceSection`/`StatCard`-only reconciliation summary grids where `DetailPanel`/`KpiCard` now cover the same real metrics.
- Retired bespoke finance `MetricCard` chrome in favor of shared `KpiCard` styling (data and links unchanged).

### Remaining blockers

- Full `admin/finance/page.tsx` still contains long-form sections (commissions, payouts, etc.) that could be split into smaller `DetailPanel`/`FormSection` units in a later pass.
- Reconciliation record `status` values must remain backend-driven; `StatusBadge` styling depends on existing badge mapping for arbitrary status strings.

### Backend/API changes

- none

### Migrations

- none

### Test results

- `cd frontend && npm run lint` — passed
- `cd frontend && npm run typecheck` — passed
- `cd frontend && npm run build` — passed
- `cd frontend && npm run test:e2e:smoke` — passed (`121 passed`)
- `cd .. && bash scripts/run-release-candidate.sh` — passed

## Pass 5 — Customer Profile and Self-Service Rollout

### Pages migrated

- `src/app/(dashboard)/admin/customers/page.tsx`
- `src/app/(dashboard)/admin/customers/[id]/page.tsx`
- `src/app/(dashboard)/admin/customers/[id]/edit/page.tsx`
- `src/app/(dashboard)/customer/page.tsx`
- `src/app/(dashboard)/customer/profile/page.tsx`
- `src/app/(dashboard)/customer/subscriptions/page.tsx`
- `src/app/(dashboard)/customer/subscriptions/[id]/page.tsx`
- `src/app/(dashboard)/customer/payments/page.tsx`

### Shared primitives used

- `DataTableShell`
- `DetailPanel`
- `FormSection` (operations — admin customer edit; customer self-service profile form groups remain on `components/ui/FormSection` for column/grid behavior)
- `KpiCard`
- `QuickActionGrid`
- `Timeline` (admin customer edit — entries only from existing audit timeline API)

### Rollout notes

- Admin customer register: KPI row and CSV import preview use `KpiCard`/`QuickActionGrid`; workflow/filter blocks use `DetailPanel`; main register table uses `DataTableShell`. Search, filters, export, and import calls unchanged.
- Admin customer detail: removed local duplicate `StatCard`; KPI strip uses `KpiCard` with the same sources; refresh control in `DetailPanel`. Dense operational sections keep `WorkspaceSection` where needed.
- Admin customer edit: operations `FormSection` groupings; `DetailPanel` for account controls; `Timeline` for audit rows only. Request payloads unchanged.
- Customer dashboard: hero and financial KPI rows use `KpiCard`/`QuickActionGrid`; preserved smoke-visible headings and settlement copy.
- Customer profile: `At a glance` from existing summary stats; `DetailPanel` for account identity; product summary grid in `DataTableShell`.
- Customer subscriptions and payments: `DetailPanel` for filter tooling; `DataTableShell` around history tables.
- Customer subscription detail: EMI schedule table in `DataTableShell`.

### Fake/dead UI removed

- Removed bespoke admin customer detail `StatCard` implementation (tooltips moved to `KpiCard` helper copy).
- Cleaned unused icon imports where primitives replaced prior stat widgets.

### Remaining blockers

- Admin customer detail file size/complexity; incremental `DetailPanel` migration for remaining sections possible later.
- Profile page shows KPIs in both `PortalPage` stats and `At a glance` (same data); optional consolidation in a future UX pass.
- `src/components/admin/customer/CustomerProfileInfo.tsx` not wired into these routes; unchanged legacy helper.

### Backend/API changes

- none

### Migrations

- none

### Test results

- `cd frontend && npm run lint` — passed
- `cd frontend && npm run typecheck` — passed
- `cd frontend && npm run build` — passed
- `cd frontend && npm run test:e2e:smoke` — passed (`121 passed`)
- `cd .. && bash scripts/run-release-candidate.sh` — passed (`RELEASE CANDIDATE VALIDATION PASSED`)
