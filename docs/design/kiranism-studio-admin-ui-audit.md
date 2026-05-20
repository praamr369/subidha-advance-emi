# Kiranism + Studio Admin UI Audit (Frontend)

Date: 2026-05-19  
Scope: `frontend/` only (UI modernization foundation + limited pilot surfaces).  
Non-goals (explicit): **no backend changes**, **no auth provider changes**, **no endpoint invention**, **no route removals**, **no fake KPIs/data**.

---

## 1) Current route families

### Next.js App Router groups

- **Public**: `frontend/src/app/(public)/*`
  - Examples: `/about`, `/contact`, `/products`, `/lucky-plan/*`, `/policies/*`, `/rent`, `/lease`, `/direct-sale`
- **Auth**: `frontend/src/app/(auth)/*`
  - `/login`, `/register`, `/forgot-password`, `/reset-password`, `/logout`
- **Dashboard / role portals**: `frontend/src/app/(dashboard)/*`
  - Role roots: `/admin/*`, `/cashier/*`, `/customer/*`, `/partner/*`, `/vendor/*`

### Dashboard role families (top-level)

- **Admin**: `frontend/src/app/(dashboard)/admin/*` (large ERP surface)
  - Notable families: `accounting/`, `finance/`, `reconciliation/`, `payments/`, `collections/`, `crm/`, `inventory/`, `purchases/`, `reports/`, `settings/`, `operations/`, `lucky-draws/`, `subscriptions/`, `customers/`
  - Notes:
    - `frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx` exists (likely transitional).
    - Some routes appear duplicated/aliased (example: multiple folder names for similar concerns like `delivery/` and `deliveries/`).
- **Cashier**: `frontend/src/app/(dashboard)/cashier/*`
  - Key families: `collect/` (payment collection workflow), `payments/` (payment details), `billing/`
- **Customer**: `frontend/src/app/(dashboard)/customer/*`
  - Key families: `subscriptions/`, `payments/`, `payment-schedule/`, `receipts/`, `contracts/`, `deliveries/`, `support/`
- **Partner**: `frontend/src/app/(dashboard)/partner/*`
  - Key families: `collections/`, `collection-requests/`, `payments/`, `commissions/`, `payouts/`
  - **Potential duplication/typo**: both `commissions/` and `commisions/` directories exist. This is a compatibility risk; **do not delete** in this pass.
- **Vendor**: `frontend/src/app/(dashboard)/vendor/*`
  - Key families: `ledger/`, `outstanding/`, `orders/`, `quotes/`, `purchase-returns/`

---

## 2) Current layout components

### App-level shell

- `frontend/src/app/layout.tsx` (root layout)
- `frontend/src/app/globals.css` (global tokens + styles)
- `frontend/src/app/loading.tsx`, `frontend/src/app/error.tsx`, `frontend/src/app/not-found.tsx`

### Role layout wrappers

Each role uses a `RoleGuard` + `DashboardShell` composition:

- `frontend/src/app/(dashboard)/admin/layout.tsx`
- `frontend/src/app/(dashboard)/cashier/layout.tsx`
- `frontend/src/app/(dashboard)/customer/layout.tsx`
- `frontend/src/app/(dashboard)/partner/layout.tsx`
- `frontend/src/app/(dashboard)/vendor/layout.tsx`

### Dashboard shell implementation

- `frontend/src/components/layout/DashboardShell.tsx`
  - Owns: sidebar state, mobile menu behavior, operator-mode preference, workspace width presets, recents/favorites hooks, and role-based navigation mapping.
  - Composes:
    - `frontend/src/components/layout/PortalShell.tsx`
    - `frontend/src/components/layout/PortalHeader.tsx`
    - `frontend/src/components/layout/RoleSidebar.tsx`
    - `frontend/src/components/layout/NotificationBellDropdown.tsx`
    - `frontend/src/components/layout/AdminWorkspaceMenubar.tsx`
    - `frontend/src/components/layout/SidebarHoverCard.tsx`
  - Uses navigation config:
    - `frontend/src/config/navigation` (via `getNavigationGroupsForRole`, `NavGroup`, `NavIconKey`)
  - Uses auth/session snapshot:
    - `frontend/src/lib/auth/session` (`getStoredSession`)
  - Uses route constants:
    - `frontend/src/lib/routes.ts` (`ROUTES`)

### Page-level shells (shared)

- `frontend/src/components/layout/page-shells.tsx`
  - Contains page shell helpers (example usage: admin dashboard uses `ExecutiveDashboardShell`).
- `frontend/src/components/layout/PageContainer.tsx`
  - Generic content wrapper.

---

## 3) Current shared UI primitives

### Operational primitives already present (recommended to extend, not replace)

- Page framing:
  - `frontend/src/components/ui/PortalPage.tsx` (widely used on admin pages)
  - `frontend/src/components/ui/PageHeader.tsx`
- Table/tooling:
  - `frontend/src/components/ui/DataTable.tsx`
  - `frontend/src/components/ui/TableToolbar.tsx`
  - `frontend/src/components/enterprise/EnterpriseDataTable.tsx` (exists; used by some finance/admin pages)
  - `frontend/src/components/ui/PaginationControls.tsx`
- States:
  - `frontend/src/components/ui/EmptyState.tsx`
  - `frontend/src/components/ui/ErrorState.tsx`
- Operations and workflow UI:
  - `frontend/src/components/ui/operations.tsx`
  - `frontend/src/components/workflows/CommandPalette.tsx`
  - `frontend/src/components/workflows/QuickActionLauncher.tsx`
  - `frontend/src/components/workflows/WorkflowProvider.tsx`
- Form building blocks:
  - `frontend/src/components/ui/FormField.tsx`
  - `frontend/src/components/ui/FormSection.tsx`
  - `frontend/src/components/ui/FormActions.tsx`
  - `frontend/src/components/ui/SearchSelect.tsx`
- Safe high-consequence UI:
  - `frontend/src/components/ui/AdminCancellationDialog.tsx` (explicit “business reason” capture)
  - `frontend/src/components/ui/ConfirmActionButton.tsx`

### Layout/portal primitives

- `frontend/src/components/ui/role-workspace.tsx`
- `frontend/src/components/ui/workspace.tsx`
- `frontend/src/components/ui/portal-primitives.tsx`

---

## 4) Existing shadcn/ui components already available

Located in `frontend/src/components/ui/*` (partial list by file):

- `accordion.tsx`, `aspect-ratio.tsx`, `avatar.tsx`, `card.tsx`, `carousel.tsx`
- `collapsible.tsx`, `context-menu.tsx`, `hover-card.tsx`, `input-otp.tsx`
- `kbd.tsx`, `menubar.tsx`, `navigation-menu.tsx`
- `resizable.tsx`, `slider.tsx`, `toggle.tsx`, `toggle-group.tsx`
- Table baseline: `table.tsx`
- Typography helpers: `typography.tsx`

Also present: `ThemeToggle.tsx` and `status-badge.tsx` (shadcn-aligned patterns).

---

## 5) Pages that look too generic (targets for polish later)

Confirmed generic-looking component:

- `frontend/src/components/search/SearchInput.tsx` uses a very plain `input` (`rounded border p-2`) and is visually inconsistent with the rest of the newer “enterprise” styling patterns.

Likely “generic” surfaces (needs per-page confirmation before changing):

- Any page not using `PortalPage` / `PageHeader` patterns, or using raw inputs/tables without shared primitives.
- Pages with minimal loading/error/empty affordances (must be verified before edit).

---

## 6) Pages that are operationally important (high-consequence)

These are financially/operationally sensitive; changes must be conservative and verified against real API responses:

- Cashier: `frontend/src/app/(dashboard)/cashier/collect/*`, `frontend/src/app/(dashboard)/cashier/payments/*`
- Admin: payments, collections, reconciliation, receipts, subscription lifecycle, cancellation/reversal flows
  - Examples (families):
    - `frontend/src/app/(dashboard)/admin/payments/*`
    - `frontend/src/app/(dashboard)/admin/collections/*`
    - `frontend/src/app/(dashboard)/admin/reconciliation/*` and `frontend/src/app/(dashboard)/admin/finance/reconciliation/*` (appears aliased)
    - `frontend/src/app/(dashboard)/admin/receipts/*`
    - `frontend/src/app/(dashboard)/admin/subscriptions/*`
    - `frontend/src/app/(dashboard)/admin/subscription-requests/*`
- Customer: subscriptions, payment history, receipts, EMI schedule
  - `frontend/src/app/(dashboard)/customer/subscriptions/*`, `.../payments/*`, `.../receipts/*`, `.../payment-schedule/*`
- Partner: collections, commissions, payouts
  - `frontend/src/app/(dashboard)/partner/collections/*`, `.../commissions/*`, `.../payouts/*`

---

## 7) Pages that must not be touched in this pass (unless a proven bug exists)

The goal of this pass is *foundation layer + limited pilot surfaces*. Avoid touching:

- Auth flows and token/session behavior:
  - `frontend/src/app/(auth)/*`
  - `frontend/src/providers/AuthProvider` (and anything that changes JWT storage/refresh semantics)
- Guard and redirect logic:
  - `frontend/src/components/guards/RoleGuard.tsx`, `frontend/src/components/guards/AuthGuard.tsx`
- Payment posting / reversal / cancellation UX flows (unless strictly visual and regression-tested):
  - Cashier collection workflow (`.../cashier/collect/*`)
  - Admin cancellation dialogs (`frontend/src/components/ui/AdminCancellationDialog.tsx`)

Rationale: these surfaces directly impact financial correctness and auditability; a UI-only change can still introduce dangerous “wrong-click” affordances.

---

## 8) Duplicate layout/component patterns

Confirmed / suspected duplicates:

- Duplicate partner route family directories: `commisions/` vs `commissions/` under `frontend/src/app/(dashboard)/partner/`
  - Treat as compatibility surface; do not delete. Identify which is actually referenced via `ROUTES` before attempting consolidation.
- Multiple page-shell approaches exist:
  - `PortalPage` is common across admin pages.
  - `ExecutiveDashboardShell` exists and is used by `frontend/src/app/(dashboard)/admin/page.tsx`.
  - Some pages likely use `PageContainer` or bespoke wrappers.

---

## 9) Dead UI, stale imports, or fake-looking UI found

No “fake KPI/chart” placeholders were confirmed in this audit pass.

Findings to verify before implementation work:

- Directory typo `partner/commisions/` strongly suggests dead/legacy surface or route alias.
- Some admin route families appear aliased via re-exports/import forwarding (seen elsewhere in tree; needs targeted confirmation per route before refactor).

---

## 10) Safe implementation sequence (additive, production-safe)

### Phase A — Design tokens + shell polish (safe foundation)

1. **Tokenize brand + surfaces** in `frontend/src/app/globals.css`:
   - Add Subidha brown/white ERP tokens as CSS variables (light + dark), without removing existing variables.
   - Ensure focus rings/contrast remain accessible in both themes.
2. **Polish `DashboardShell` visuals** without changing navigation meaning:
   - Sidebar spacing/typography/hover/focus states.
   - Topbar action area density and alignment.
   - Mobile sidebar open/close affordances and overlay behavior.

---

## Phase B primitives result

Date: 2026-05-20  
Scope: `frontend/` only (UI primitives used by existing pages; no backend/auth/API changes).

### Components created (immediately used)

- `frontend/src/components/erp/ERPEmptyState.tsx` (thin wrapper over `frontend/src/components/feedback/EmptyState.tsx`)
- `frontend/src/components/erp/ERPErrorState.tsx` (thin wrapper over `frontend/src/components/feedback/ErrorState.tsx`)
- `frontend/src/components/erp/ERPLoadingState.tsx` (thin wrapper over `frontend/src/components/feedback/LoadingBlock.tsx`)

Rationale: keep primitives additive and type-safe, reusing the existing shadcn-aligned feedback patterns and preserving dark-mode behavior.

### Pages updated

- `frontend/src/app/(dashboard)/admin/operations/page.tsx`
  - Replaced repeated loading/error/empty rendering with ERP wrappers only (no changes to data fetching, routing, or action logic).

### Why this page was low-risk

- Operational summary surface only; no payment posting, reversals, cancellations, or ledger mutations.
- Existing API/service usage preserved (`getAdminOperationsQueueSummary`, `getHrSummary`) and the same UI semantics remain.

### Intentionally not touched

- Backend code, API contracts, serializers, endpoints.
- Auth/session/RoleGuard/middleware/token handling/redirect behavior.
- Cashier collection submit flow, payment posting pages, cancellation/void/return action logic.
- Lucky draw execution, waiver/commission/payout/ledger/reconciliation logic, accounting posting logic.
- Any route removals or renames.

### Duplicate partner commissions routes

- Confirmed unchanged: both remain present and untouched:
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

---

## Phase B second-page adoption result

Date: 2026-05-20  
Scope: `frontend/` only (UI primitive adoption on exactly one additional low-risk admin list/catalog page; no backend/auth/API changes).

### Page selected

- `frontend/src/app/(dashboard)/admin/customers/page.tsx` (Admin → Customers → Customer Register)

### Why it was low-risk

- List/catalog workflow surface with read-only register browsing + navigation into existing downstream routes.
- Already had explicit local loading/error/empty state rendering suitable for wrapper-only replacement.
- No changes to payment posting, reversals, cancellations, reconciliation, lucky draw execution, or accounting posting logic.

### Components reused

- `frontend/src/components/erp/ERPPageShell.tsx`
- `frontend/src/components/erp/ERPLoadingState.tsx`
- `frontend/src/components/erp/ERPErrorState.tsx`
- `frontend/src/components/erp/ERPEmptyState.tsx`

### Services/API contracts preserved

- Existing data-fetch and action calls remain unchanged (no request param changes, no response-shape assumption changes).

### Intentionally not touched

- Backend code and API contracts.
- Auth/session/RoleGuard/middleware/token handling/redirect behavior.
- EMI logic, payment posting flows, cashier collection submit flow, cancellation/void/return actions.
- Waiver/commission/payout/ledger/reconciliation/audit behavior.
- Any route removals or renames.

### Duplicate partner commissions routes

- Confirmed unchanged in this pass:
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### Next recommended pilot page

- Admin products catalog list: `frontend/src/app/(dashboard)/admin/products/page.tsx` (apply wrappers only where it already has explicit local loading/error/empty rendering).

### Next recommended pilot pages

Pick 1 low-risk admin list/catalog page at a time (no high-consequence money flows), prioritizing pages already using shared services and with clear loading/error/empty UI blocks suitable for wrapper replacement.
3. **Introduce consistent operational page headers** by enhancing existing primitives:
   - Prefer extending `PortalPage` / `PageHeader` rather than creating a parallel system.

### Phase B — Shared ERP UI primitives (only if used immediately)

Implement a minimal set of new wrappers (or extend existing ones) and **apply to pilot pages**:

- `ERPPageShell` / `ERPPageHeader` (likely as thin wrappers around `PortalPage` + `PageHeader`)
- `ERPDataToolbar` (align with `TableToolbar` / `EnterpriseDataTable` patterns)
- `ERPEmptyState` / `ERPLoadingState` / `ERPErrorState` (wrap existing `EmptyState` / `ErrorState` with consistent layout)
- `ERPStatusBadge` (wrap or extend `status-badge.tsx`)

Rule: do not create components that are not immediately adopted by a pilot page.

### Phase C — Pilot pages (limited, high-impact, role-differentiated)

Recommended pilot targets (validate per-page service usage first):

1. Admin dashboard: `frontend/src/app/(dashboard)/admin/page.tsx`
2. Admin operations cockpit: `frontend/src/app/(dashboard)/admin/operations/*`
3. Admin accounting landing: `frontend/src/app/(dashboard)/admin/accounting/*`
4. Cashier collection workspace: `frontend/src/app/(dashboard)/cashier/collect/*` (**visual-only**; preserve flow strictly)
5. Customer dashboard/subscriptions: `frontend/src/app/(dashboard)/customer/dashboard/*` or `.../subscriptions/*`
6. Partner collections: `frontend/src/app/(dashboard)/partner/collections/*`

For each pilot page:

- Confirm the page’s service module in `frontend/src/services/*` and its expected response shape.
- Preserve role guards and routing behavior.
- Preserve loading/error/empty logic; if inconsistent, refactor toward shared primitives without changing semantics.
- Avoid new “KPI cards” unless values are already returned by backend/services; otherwise show a conservative empty/limited-data state.

---

## Appendix: Auth/role guard behavior (confirmed)

- Role gating uses `frontend/src/components/guards/RoleGuard.tsx`.
  - Determines “effective auth” using `useAuth()` plus `getStoredSession()` fallback.
  - Redirects unauthenticated users to `/login?next=...`.
  - Redirects unauthorized roles to `/unauthorized`.

---

## Phase A implementation result (2026-05-19)

Scope: shell/layout polish + smallest used shared primitive (Phase B). Backend/auth/guards unchanged.

### Files changed

- `frontend/src/components/layout/PortalShell.tsx`
- `frontend/src/components/layout/RoleSidebar.tsx`
- `frontend/src/components/layout/DashboardShell.tsx`
- `frontend/src/components/erp/ERPPageShell.tsx` (new)
- `frontend/src/app/(dashboard)/admin/operations/page.tsx` (pilot page)

### What was improved

- **Mobile and viewport correctness**: use `100dvh` in dashboard shell and sidebar chrome to reduce mobile browser URL-bar “jump” while preserving existing layout behavior.
- **Brand-consistent topbar action styling**: remove hard-coded blue shadow on the primary “Quick Actions” button and align it to `--primary`.
- **Small Phase B primitive (used immediately)**: added `ERPPageShell` as a thin wrapper over existing `PortalPage` and adopted it on **Admin → Operations** workspace page (no data/behavior changes).

### What was intentionally not touched

- No backend changes; no API contract changes.
- No auth/session logic changes.
- No middleware changes.
- No `RoleGuard` changes.
- No high-consequence payment/collection/cancellation flows.
- No EMI, waiver, commission, payout, ledger, reconciliation, lucky draw, or audit behavior changes.
- No route removal or renames.

### Duplicate partner commissions route status

- Both route families remain intact and working by policy:
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### Follow-up migration recommendation (future, not executed here)

- Add a **single canonical route** (`/partner/commissions`) and a **safe redirect**/alias path for `/partner/commisions` once route usage is confirmed via `ROUTES` mapping + navigation config + analytics/logs; then deprecate the typo route in a controlled release.
