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
- `cd frontend && npm run test:e2e:smoke` — passed (`121 passed`)
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
