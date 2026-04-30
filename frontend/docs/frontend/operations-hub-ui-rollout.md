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
