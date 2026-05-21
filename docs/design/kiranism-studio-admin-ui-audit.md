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

## Route category audit result

Date: 2026-05-20  
Scope: **Audit + planning only** (no UI transformations in this pass).

- **Inventory output**:
  - Markdown: `docs/design/kiranism-route-category-map.md`
  - JSON: `docs/design/kiranism-route-category-map.json`
- **Total pages inspected** (App Router `page.*`): **393**
- **Route families found**: admin (286), public (34), customer (27), partner (20), vendor (11), cashier (7), auth (5), unknown (2), compatibility (1)
- **Migration class counts**:
  - SAFE_AUTO: 267
  - SAFE_LAYOUT_ONLY: 39
  - MANUAL_REVIEW: 81
  - DO_NOT_TOUCH: 6
- **Duplicate partner commissions route status**: **unchanged and preserved** (both remain by policy)
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

---

## Phase 1 shared ERP UI foundation result

Date: 2026-05-20  
Scope: **Frontend UI foundation only** (shared primitives + shell refinement).  
Non-goals: **no backend changes**, **no auth/session/RoleGuard changes**, **no route changes**, **no API contract changes**, **no fake KPIs/data**.

### 1) Shared primitives created (additive)

Located in `frontend/src/components/erp/`:

- `ERPPageHeader.tsx`
- `ERPSectionShell.tsx`
- `ERPDataToolbar.tsx`
- `ERPRegisterShell.tsx`
- `ERPActionPanel.tsx`
- `ERPStatusBadge.tsx`
- `ERPAuditNote.tsx`
- `ERPDetailGrid.tsx`
- `ERPMobileCardList.tsx`
- `ERPMetricStrip.tsx`
- Optional barrel exports: `index.ts` (does not change existing import paths)

### 2) Shared primitives reused (existing)

- `ERPPageShell.tsx` (thin wrapper over `PortalPage`)
- `ERPEmptyState.tsx`, `ERPErrorState.tsx`, `ERPLoadingState.tsx` (thin wrappers over feedback primitives)
- `frontend/src/components/ui/portal-primitives.tsx` (`PageSection`, `SectionHeader`, `DataToolbar`, `MetricCard`)
- `frontend/src/components/ui/status-badge.tsx`

### 3) Shell/layout files changed

- None in this pass (foundation components only; shell behavior intentionally untouched).

### 4) Route families this foundation supports

- Admin, Cashier, Customer, Partner, Vendor, Public (shared primitives are role-agnostic; pages provide their own actions/links/data).

### 5) What was intentionally not touched

- Backend (Django/DRF/PostgreSQL) and all API request/response contracts
- Auth/JWT/session storage, refresh flow, logout, redirects
- `RoleGuard` and role visibility/permissions
- EMI logic, payment posting, lucky draw, waiver, commission, payout, ledger, reconciliation, accounting posting, audit behavior
- Route structure (no move/rename/delete)

### 6) Duplicate partner commissions route status

- Preserved unchanged:
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 7) Fast frontend checks

- `npm run lint`: ✅ pass
- `npm run typecheck`: ✅ pass
- `npm run build`: ✅ pass
- `npm run check:routes`: ✅ pass (no collisions; checked 393 routes, 11 compatibility redirects)

### 8) Next recommended phase

- Phase 2 — Public website / brand site

---

## Phase 2 public website transformation result

Date: 2026-05-20  
Scope: **Public website / brand site only** (`frontend/src/app/(public)/**`).  
Non-goals: no backend changes, no auth/session changes, no route changes, no invented endpoints, no fake winners/products/stats.

### 1) Public routes touched (visual-only)

- `/` (home): unchanged in this phase (already premium; relies on live public APIs).
- `/products`, `/products/[id]`: improved surface consistency and dark-mode safety by replacing hard-coded white panels with shared `public-*` surfaces.
- `/winners`, `/winner-history`: upgraded section framing and honest empty/error surface styling; preserved masked identity + live API sourcing.
- `/about`, `/contact`: improved readability panels and consistent premium surfaces.

### 2) Public routes intentionally not touched

All other public routes remain unchanged to keep this pass safe and reviewable:
- `/apply`, `/blog`, `/blog/[slug]`
- `/how-it-works`, `/lucky-plan`, `/lucky-plan/*`
- `/policies`, `/policies/[slug]` and other legal/policy routes (`/terms`, `/privacy`, `/warranty`, etc.)
- `/direct-sale`, `/rent`, `/lease`, `/vision-trust` and other marketing/legal surfaces

### 3) Components reused

- `frontend/src/components/public/PublicPageShell.tsx`
- `frontend/src/components/public/PublicHeroBanner.tsx`
- Existing public atoms: marketing banners, trust strips, product/winner widgets (no changes)
- Shared public CSS tokens: `public-surface`, `public-card`, `public-card-sm`, public action buttons

### 4) Public components created

- None (reused and refined existing public shell components).

### 5) Services/API contracts preserved

- Preserved all public API usage and response handling:
  - `@/lib/public-api` (re-exporting `@/services/public`)
  - No request param changes and no response-shape assumptions added

### 6) SEO/i18n/copy safety confirmation

- No route path changes
- No changes to `metadata` / `generateMetadata` exports
- No changes to `public-i18n` dictionary structure or cookie handling

### 7) Fake data avoided confirmation

- No fake winners, fake products, fake stats, or invented endpoints were added.

### 8) Duplicate partner commissions route status

- Preserved unchanged:
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 9) Remaining public UI gaps

- Standardize remaining public pages that still use hard-coded `bg-white/*` panels for better dark-mode behavior (do this incrementally).
- Align legal/policy page typography and content density to match updated premium surfaces (without changing content).

### 10) Next recommended phase

- Phase 3 — Admin cockpit / operations (SAFE_AUTO surfaces first; keep MANUAL_REVIEW pages untouched).

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

---

## Phase B products adoption result

Date: 2026-05-20  
Scope: `frontend/` only (UI primitive adoption on exactly one additional low-risk admin catalog/register page; no backend/auth/API changes).

### Page selected

- `frontend/src/app/(dashboard)/admin/products/page.tsx` (Admin → Products → Product Register)

### Why it was low-risk

- Catalog/register surface only (read + filter + export + navigation); no cashier collection, payment posting, cancellations, reversals, reconciliation, accounting posting, lucky draw execution, or payout execution.
- Page already had explicit local loading/error/empty state rendering blocks suitable for wrapper-only replacement.

### Components reused

- `frontend/src/components/erp/ERPPageShell.tsx`
- `frontend/src/components/erp/ERPLoadingState.tsx`
- `frontend/src/components/erp/ERPErrorState.tsx`
- `frontend/src/components/erp/ERPEmptyState.tsx`

### Services/API contracts preserved

- Existing data fetching remains unchanged:
  - continues using `apiFetch()` against `/admin/products/` (including `q`, `category`, `subcategory` query params).
  - preserves existing pagination handling via `results/next` when present (no request param changes).
- No changes to table rows, links, row actions, or router navigation behavior.

### Product pricing / inventory safety confirmation

- Pricing display remains read-only and unchanged: the page still renders `base_price` as the contract total (no pricing mutation and no EMI math changes).
- Inventory readiness display remains read-only and unchanged (no stock sync, no inventory mutations).

### Intentionally not touched

- Backend code, API contracts, serializers, endpoints.
- Auth/session/RoleGuard/middleware/token handling/redirect behavior.
- Product create/edit/delete behavior or any pricing logic.
- Inventory stock sync logic.
- EMI logic, payment posting, waiver, commissions, payouts, ledger, reconciliation, audit behavior.
- Route removals or renames; no fake KPIs/charts/counters/records.

### Duplicate partner commissions route status

- Confirmed unchanged in this pass:
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### Next recommended pilot page

- Admin product masters workspace: `frontend/src/app/(dashboard)/admin/products/masters/page.tsx` (only if it already has explicit local loading/error/empty blocks; otherwise defer and document).

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

---

## Phase 3 admin cockpit operations transformation result (2026-05-20)

Scope: **Frontend UI only** for Admin Cockpit / Operations SAFE pages.  
Non-goals (enforced): **no backend changes**, **no API contract changes**, **no auth/session/RoleGuard changes**, **no route moves/renames/deletes**, **no invented KPIs/charts/endpoints**, **no permission weakening**.

### 1) Admin routes touched

- `/admin/operations` (SAFE_AUTO)
- `/admin/operations/command-center` (SAFE_AUTO)
- `/admin/operations/today-work` (SAFE_AUTO)
- `/admin/erp` (SAFE_AUTO)
- `/admin/global-search` (SAFE_LAYOUT_ONLY)

### 2) Admin routes deferred

- `/admin` (SAFE_AUTO) — deferred because it is a large mixed-domain executive surface; keep unchanged to avoid accidental domain scope creep in Phase 3.
- `/admin/notifications` (SAFE_AUTO) — deferred because the current UI is driven by shared `NotificationCenterPanel` (used by other roles); transforming it would implicitly touch non-admin routes.
- All other `Admin Cockpit / Operations` routes in the map that are operationally tied to inventory/CRM/deliveries/EMI/payment/purchases/partners/compliance/tax — explicitly out of Phase 3 scope per constraints (defer to later dedicated phases).

### 3) Pages transformed by migrationClass

- SAFE_AUTO:
  - `/admin/operations`
  - `/admin/operations/command-center`
  - `/admin/operations/today-work`
  - `/admin/erp`
- SAFE_LAYOUT_ONLY:
  - `/admin/global-search`

### 4) Components reused

- ERP page framing: `frontend/src/components/erp/ERPPageShell.tsx`, `frontend/src/components/erp/ERPSectionShell.tsx`
- Consistent states: `frontend/src/components/erp/ERPLoadingState.tsx`, `frontend/src/components/erp/ERPErrorState.tsx`, `frontend/src/components/erp/ERPEmptyState.tsx`
- Tooling wrapper: `frontend/src/components/erp/ERPDataToolbar.tsx` (admin global search)
- Existing business UI kept intact: `OperationsCommandCenterWorkspace`, `GlobalSearchOperationalWorkspace`, `PipelineBoard`, `WorkspaceShell`
- shadcn/ui controls reused (no custom forks): `Button`, `Input`

### 5) Components created

- None (Phase 3 is composition-only over existing ERP primitives and existing page components).

### 6) Services/API contracts preserved

- No changes to `frontend/src/services/**`.
- No endpoint additions or changes.
- No request parameter changes.
- No response normalization changes.

### 7) Auth/role safety confirmation

- No changes to JWT/session storage, refresh flow, logout, redirects, middleware, or `RoleGuard`.
- No cross-role data exposure changes (pages remain under admin portal routing).

### 8) Financial/audit safety confirmation

- No changes to EMI logic, payment posting, waivers, commissions, payouts, reconciliation, accounting posting, or audit logging.
- Phase 3 changes are UI framing/state consistency only; no mutation handlers were altered.

### 9) Duplicate partner commissions route status

- Preserved unchanged (explicit policy):
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 10) Remaining admin cockpit UI gaps

- `/admin` executive dashboard remains a large mixed-domain surface; consider a dedicated “Admin Executive Dashboard” pass with stricter sub-scope (operations-only framing, keep finance/inventory links intact).
- `/admin/notifications` needs an ERP-aligned header/toolbar treatment, but must be done in a way that does **not** change non-admin role experiences (likely via additive props or role-scoped wrapper component).

### 11) Next recommended phase

- Phase 4 — Products / catalog master (UI-only, SAFE_LAYOUT_ONLY surfaces first), or
- Phase 6 — Customer / CRM intelligence (read-first register/detail polish), keeping money flows explicitly deferred.

---

## Phase 4 products catalog transformation result (2026-05-20)

Scope: **Frontend UI only** for Products / Catalog Master SAFE pages (admin + vendor register surfaces).  
Non-goals (enforced): **no backend changes**, **no API contract changes**, **no auth/session/RoleGuard changes**, **no route moves/renames/deletes**, **no invented KPIs/charts/endpoints**, **no permission weakening**, **no pricing/inventory logic changes**.

### 1) Product/catalog routes touched

- `/admin/products` (SAFE_LAYOUT_ONLY)
- `/admin/products/create` (SAFE_AUTO)
- `/admin/products/import` (SAFE_AUTO)
- `/admin/products/masters` (SAFE_AUTO)
- `/admin/products/[id]` (SAFE_AUTO)
- `/admin/products/[id]/edit` (SAFE_AUTO)
- `/admin/vendors/products` (SAFE_AUTO)
- `/vendor/products` (SAFE_LAYOUT_ONLY)

### 2) Product/catalog routes deferred

- `/admin/products/workspace` (SAFE_AUTO) — already uses the shared admin workspace shell; left unchanged in Phase 4 to keep this pass strictly “catalog/register/detail/forms” and avoid scope creep into inventory-style workspace boards.

### 3) Pages transformed by migrationClass

- SAFE_AUTO:
  - `/admin/products/create`
  - `/admin/products/import`
  - `/admin/products/masters`
  - `/admin/products/[id]`
  - `/admin/products/[id]/edit`
  - `/admin/vendors/products`
- SAFE_LAYOUT_ONLY:
  - `/admin/products`
  - `/vendor/products`

### 4) Components reused

- ERP framing: `frontend/src/components/erp/ERPPageShell.tsx`, `frontend/src/components/erp/ERPSectionShell.tsx`
- Register toolbars/metrics: `frontend/src/components/erp/ERPDataToolbar.tsx`, `frontend/src/components/erp/ERPMetricStrip.tsx`
- Detail fields: `frontend/src/components/erp/ERPDetailGrid.tsx`
- States: `frontend/src/components/erp/ERPLoadingState.tsx`, `frontend/src/components/erp/ERPErrorState.tsx`, `frontend/src/components/erp/ERPEmptyState.tsx`
- Status chips: `frontend/src/components/erp/ERPStatusBadge.tsx`

### 5) Components created

- None (Phase 4 is composition-only over existing ERP primitives and existing page logic).

### 6) Product services/API contracts preserved

- No changes to:
  - `frontend/src/services/products/index.ts` (product list, catalog options, masters CRUD, inventory profile prepare)
  - `frontend/src/services/vendor-ops.ts` (vendor product list/create)
  - `frontend/src/services/import-hub.ts` (product import preview/post)
- No endpoint path, request param, or response normalization changes.

### 7) Auth/role safety confirmation

- No changes to JWT/session handling, refresh flow, logout, redirects, middleware, or `RoleGuard`.
- No cross-role data exposure changes (admin pages remain under admin portal; vendor catalog remains under vendor portal).

### 8) Product pricing/inventory integrity impact

- Product base price display meaning preserved: **base price = total contract price** (no pricing math changes).
- Inventory/profile/stock posture remains read-only in this pass (no changes to stock sync logic; only UI framing of existing readiness states/buttons where already present).

### 9) Financial integrity impact

- No changes to EMI logic, payment posting, waiver logic, commission logic, payout logic, ledger behavior, reconciliation behavior, accounting posting, or opening balance locking.

### 10) Auditability impact

- No changes to audit log structures or mutation semantics; Phase 4 is UI framing/state consistency only.

### 11) Duplicate partner commissions route status

- Preserved unchanged (explicit policy):
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 12) Remaining products/catalog UI gaps

- Standardize remaining non-product master catalog surfaces (if any) under later phases using the same ERP register framing (do not mix with inventory/stock control pages unless explicitly scoped).
- Consider consolidating product master field normalization patterns into a shared view-model helper (UI-only) once Phase 4 diffs stabilize (avoid spreading new assumptions across pages).

### 13) Next recommended phase

- Phase 5 — Inventory / stock control (SAFE_AUTO read-only surfaces first; strict mutation guardrails), or
- Phase 6 — Customer / CRM intelligence (register/detail polish without touching money flows).

---

## Phase 5 inventory stock control transformation result (2026-05-20)

Scope: **Frontend UI only** for Inventory / Stock Control SAFE pages (admin + vendor surfaces categorized as Inventory/Stock Control).  
Non-goals (enforced): **no backend changes**, **no API contract changes**, **no auth/session/RoleGuard changes**, **no route moves/renames/deletes**, **no invented KPIs/charts/endpoints**, **no permission weakening**, **no stock sync / movement posting logic changes**.

### 1) Inventory/stock routes touched

- `/admin/inventory` (SAFE_AUTO)
- `/admin/inventory/workspace` (SAFE_AUTO)
- `/admin/inventory/ledger` (SAFE_AUTO)
- `/admin/inventory/movements` (SAFE_AUTO)
- `/admin/inventory/stock-on-hand` (SAFE_AUTO)
- `/admin/inventory/valuation` (SAFE_AUTO)
- `/admin/inventory/items` (SAFE_AUTO)
- `/admin/inventory/adjustments` (SAFE_AUTO)
- `/admin/inventory/readiness` (SAFE_AUTO)
- `/admin/inventory/stock-needs` (SAFE_AUTO)
- `/admin/inventory/demand-planning` (SAFE_AUTO)
- `/admin/inventory/purchase-needs` (SAFE_AUTO)
- `/admin/inventory/profiles` (SAFE_AUTO)
- `/admin/inventory/profiles/[id]` (SAFE_AUTO)
- `/admin/bi/inventory` (SAFE_AUTO)
- `/admin/vendors/categories` (SAFE_AUTO; categorized inventory/stock control)
- `/admin/vendors/ledger` (SAFE_AUTO; categorized inventory/stock control)
- `/vendor/ledger` (SAFE_AUTO; categorized inventory/stock control)
- `/admin/inventory/locations` (SAFE_LAYOUT_ONLY)
- `/admin/inventory/opening-stock` (SAFE_LAYOUT_ONLY)

### 2) Inventory/stock routes deferred

- `/admin/reports/inventory` (SAFE_AUTO) — deferred in Phase 5 because it is a shared `Phase5ReportSurface` composition used by multiple report categories; changing the shared report surface in an Inventory-only phase risks cross-domain UI changes outside this scope.

### 3) Pages transformed by migrationClass

- SAFE_AUTO:
  - `/admin/inventory`
  - `/admin/inventory/workspace`
  - `/admin/inventory/ledger`
  - `/admin/inventory/movements`
  - `/admin/inventory/stock-on-hand`
  - `/admin/inventory/valuation`
  - `/admin/inventory/items`
  - `/admin/inventory/adjustments`
  - `/admin/inventory/readiness`
  - `/admin/inventory/stock-needs`
  - `/admin/inventory/demand-planning`
  - `/admin/inventory/purchase-needs`
  - `/admin/inventory/profiles`
  - `/admin/inventory/profiles/[id]`
  - `/admin/bi/inventory`
  - `/admin/vendors/categories`
  - `/admin/vendors/ledger`
  - `/vendor/ledger`
- SAFE_LAYOUT_ONLY:
  - `/admin/inventory/locations`
  - `/admin/inventory/opening-stock`

### 4) Components reused

- ERP framing: `frontend/src/components/erp/ERPPageShell.tsx`, `frontend/src/components/erp/ERPSectionShell.tsx`
- Register toolbars: `frontend/src/components/erp/ERPDataToolbar.tsx`
- Detail fields: `frontend/src/components/erp/ERPDetailGrid.tsx`
- States: `frontend/src/components/erp/ERPLoadingState.tsx`, `frontend/src/components/erp/ERPErrorState.tsx`, `frontend/src/components/erp/ERPEmptyState.tsx`
- Status chips: `frontend/src/components/erp/ERPStatusBadge.tsx`

### 5) Components created

- None (Phase 5 is composition-only over existing ERP primitives and existing page logic).

### 6) Inventory services/API contracts preserved

- No changes to:
  - `frontend/src/services/inventory/*` (stock summary, ledger, movements, opening-stock, adjustments, items, locations)
  - `frontend/src/services/inventory-ops.ts` (readiness, stock needs)
  - `frontend/src/services/direct-sale-workspace.ts` (purchase needs list)
  - `frontend/src/services/vendors.ts`, `frontend/src/services/vendor-ops.ts` (vendor category/ledger surfaces)
- No endpoint path, request param, or response normalization changes.

### 7) Auth/role safety confirmation

- No changes to JWT/session handling, refresh flow, logout, redirects, middleware, or `RoleGuard`.
- No cross-role data exposure changes (admin inventory surfaces remain under admin portal; vendor ledger remains under vendor portal).

### 8) Stock sync / inventory integrity impact

- Stock quantities remain derived from existing backend-owned stock ledger/snapshot endpoints only.
- No changes to stock sync behavior, stock movement posting logic, warehouse/branch stock rules, direct-sale stock deduction/return restoration, or delivery bridge semantics.

### 9) Financial integrity impact

- No changes to EMI logic, payment posting, waiver logic, commission logic, payout logic, ledger behavior, reconciliation behavior, accounting posting, or audit behavior.

### 10) Auditability impact

- No changes to immutable/append-only expectations for stock history; UI changes are framing/state consistency only.

### 11) Duplicate partner commissions route status

- Preserved unchanged (explicit policy):
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 12) Remaining inventory UI gaps

- `/admin/reports/inventory` remains on the shared Phase5 report surface; consider a dedicated “Reports surfaces” pass to refactor shared report framing safely without touching finance/accounting semantics.

### 13) Next recommended phase

- Phase 6 — Customer / CRM intelligence (register/detail polish), keeping money flows explicitly deferred.

---

## Phase 6 customer CRM intelligence transformation result (2026-05-20)

Scope: **Frontend UI only** for Customer / CRM Intelligence SAFE pages.  
Non-goals (enforced): **no backend changes**, **no API contract changes**, **no auth/session/RoleGuard changes**, **no route moves/renames/deletes**, **no invented KPIs/charts/endpoints**, **no permission weakening**, **no customer workflow changes** (onboarding, approval, password reset, edit handlers).

### 1) Customer/CRM routes touched

- `/admin/bi/customers` (SAFE_AUTO)
- `/admin/crm` (SAFE_AUTO)
- `/admin/crm/follow-ups` (SAFE_AUTO)
- `/admin/crm/pipeline` (SAFE_AUTO)
- `/admin/customers/[id]/profile` (SAFE_AUTO)
- `/admin/customers/[id]/edit` (SAFE_LAYOUT_ONLY)
- `/admin/online-enquiries` (SAFE_AUTO)
- `/admin/online-enquiries/[id]` (SAFE_AUTO)

### 2) Customer/CRM routes deferred

- `/admin/customers` (SAFE_LAYOUT_ONLY) — already using `ERPPageShell` + ERP state wrappers; left unchanged to keep Phase 6 diffs focused on the CRM desk and enquiry/detail surfaces.
- `/admin/customers/[id]` (SAFE_LAYOUT_ONLY) — very large operational profile surface; defer a dedicated “customer detail workspace” refinement pass to avoid accidental handler/visibility churn.
- `/admin/customers/create` (SAFE_AUTO) — route delegates to `@/domains/customers/pages/AdminCustomerCreatePage`; defer to a domains-level design pass to keep Phase 6 route diffs small and reviewable.
- `/admin/crm/leads` (SAFE_AUTO) — already uses `PortalPage` + operational lanes/register framing; defer until the lead inbox + CRM lead register can be aligned together without duplicating toolbars.
- `/admin/crm/parties` (SAFE_AUTO) — already uses `PortalPage` + operational lanes/register framing; defer to a dedicated Party 360 detail/register pass.
- `/admin/crm/parties/[id]` (SAFE_AUTO) — contains mutation actions (party updates + interaction logging); defer to keep Phase 6 focused on read-first customer intelligence layouts.
- `/admin/reports/crm` (SAFE_AUTO) — shared `Phase5ReportSurface` composition; defer shared report framing changes to a dedicated reports pass to avoid cross-domain UI ripple.
- `/partner/customers` (SAFE_LAYOUT_ONLY) and `/partner/customers/[id]` (SAFE_AUTO) — partner-scoped customer intelligence surfaces deferred to a partner-only CRM pass to avoid any accidental role boundary regressions in an admin-focused phase.

### 3) Pages transformed by migrationClass

- SAFE_AUTO:
  - `/admin/bi/customers`
  - `/admin/crm`
  - `/admin/crm/follow-ups`
  - `/admin/crm/pipeline`
  - `/admin/customers/[id]/profile`
  - `/admin/online-enquiries`
  - `/admin/online-enquiries/[id]`
- SAFE_LAYOUT_ONLY:
  - `/admin/customers/[id]/edit`

### 4) Components reused

- ERP framing: `frontend/src/components/erp/ERPPageShell.tsx`, `frontend/src/components/erp/ERPSectionShell.tsx`
- ERP states: `frontend/src/components/erp/ERPLoadingState.tsx`, `frontend/src/components/erp/ERPErrorState.tsx`, `frontend/src/components/erp/ERPEmptyState.tsx`
- ERP details: `frontend/src/components/erp/ERPDetailGrid.tsx`
- ERP audit framing: `frontend/src/components/erp/ERPAuditNote.tsx`
- ERP status chips: `frontend/src/components/erp/ERPStatusBadge.tsx`

### 5) Components created

- None (Phase 6 is composition-only over existing ERP primitives and existing page logic).

### 6) Customer/CRM services/API contracts preserved

- No changes to endpoint paths, request params, or response normalization.
- No changes to:
  - `frontend/src/services/crm-module` (internal CRM follow-ups/pipeline/profile)
  - `frontend/src/services/admin-erp`, `frontend/src/services/crm`, `frontend/src/services/customers` (CRM workspace overview inputs)
  - `frontend/src/services/online-enquiries` (enquiry register + actions)

### 7) Customer privacy/role safety confirmation

- No changes to route locations or role layouts.
- No changes that expand partner/customer visibility into admin-only data.

### 8) Auth/role safety confirmation

- No changes to JWT/session handling, refresh flow, logout, redirects, middleware, or `RoleGuard`.

### 9) Financial/audit safety confirmation

- No changes to EMI logic, payment posting, waiver logic, commission logic, payout logic, ledger behavior, reconciliation behavior, accounting posting, or audit behavior.
- Online enquiry actions remain explicit and unchanged (suggest, request quotes, select quote, draft PO).

### 10) Duplicate partner commissions route status

- Preserved unchanged (explicit policy):
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 11) Remaining customer/CRM UI gaps

- Align `/admin/customers/[id]` (large customer intelligence surface) to ERP section hierarchy without touching action wiring.
- Decide whether CRM follow-ups/pipeline should stay as lightweight internal boards or be migrated into the same register/table primitives used by `/admin/crm/leads` and `/admin/crm/parties`.
- Run a dedicated “Party 360 mutation-safe UI pass” for `/admin/crm/parties/[id]` (SAFE_AUTO but includes mutation actions).

### 12) Next recommended phase

- Phase 7 — Subscriptions / contract desk (SAFE_LAYOUT_ONLY first; keep payment/waiver/collection actions under manual review where applicable).

---

## Phase 7 subscriptions contract desk transformation result (2026-05-20)

Scope: **Frontend UI only** for Subscriptions / Contract Desk SAFE pages.  
Non-goals (enforced): **no backend changes**, **no API contract changes**, **no auth/session/RoleGuard changes**, **no route moves/renames/deletes**, **no invented contracts/EMIs/KPIs**, **no permission weakening**, **no handler/validation/submit changes**.

### 1) Subscription/contract routes touched

- `/admin/subscriptions` (SAFE_LAYOUT_ONLY)
- `/admin/subscriptions/[id]` (SAFE_AUTO)
- `/admin/subscriptions/[id]/lifecycle` (SAFE_AUTO)
- `/admin/subscription-requests` (SAFE_LAYOUT_ONLY)
- `/admin/subscription-requests/[id]` (SAFE_AUTO)
- `/admin/subscriptions/advance-emi/create` (SAFE_AUTO; via `SubscriptionCreatePage`)
- `/admin/subscriptions/rent/create` (SAFE_AUTO; via `SubscriptionCreatePage`)
- `/admin/subscriptions/lease/create` (SAFE_AUTO; via `SubscriptionCreatePage`)
- `/admin/billing/contracts` (SAFE_AUTO; contract/billing workspace view only)
- `/customer/subscriptions` (SAFE_AUTO)
- `/customer/subscriptions/[id]` (SAFE_AUTO)
- `/customer/contracts` (SAFE_AUTO)
- `/customer/subscription-requests` (SAFE_AUTO)
- `/customer/subscription-requests/[id]` (SAFE_AUTO)
- `/customer/subscription-requests/create` (SAFE_AUTO; via `CustomerSubscriptionRequestCreatePage`)
- `/partner/subscriptions` (SAFE_LAYOUT_ONLY)
- `/partner/subscriptions/[id]` (SAFE_AUTO)
- `/partner/subscription-requests` (SAFE_AUTO)
- `/partner/subscription-requests/[id]` (SAFE_AUTO)
- `/partner/subscription-requests/create` (SAFE_LAYOUT_ONLY)

### 2) Subscription/contract routes deferred

- `/admin/reports/contracts` (SAFE_AUTO) — remains on the shared `Phase5ReportSurface`; defer report framing changes to a dedicated reports pass to avoid cross-domain UI ripple.
- `/admin/subscriptions/create` (SAFE_AUTO) — compatibility redirect route; no UI surface to transform.

### 3) Pages transformed by migrationClass

- SAFE_AUTO:
  - `/admin/billing/contracts`
  - `/admin/subscription-requests/[id]`
  - `/admin/subscriptions/[id]`
  - `/admin/subscriptions/[id]/lifecycle`
  - `/admin/subscriptions/advance-emi/create` (via `SubscriptionCreatePage`)
  - `/admin/subscriptions/rent/create` (via `SubscriptionCreatePage`)
  - `/admin/subscriptions/lease/create` (via `SubscriptionCreatePage`)
  - `/customer/contracts`
  - `/customer/subscription-requests`
  - `/customer/subscription-requests/[id]`
  - `/customer/subscription-requests/create` (via `CustomerSubscriptionRequestCreatePage`)
  - `/customer/subscriptions`
  - `/customer/subscriptions/[id]`
  - `/partner/subscription-requests`
  - `/partner/subscription-requests/[id]`
  - `/partner/subscriptions/[id]`
- SAFE_LAYOUT_ONLY:
  - `/admin/subscription-requests`
  - `/admin/subscriptions`
  - `/partner/subscription-requests/create`
  - `/partner/subscriptions`

### 4) Components reused

- ERP shell/states: `frontend/src/components/erp/ERPPageShell.tsx`, `frontend/src/components/erp/ERPLoadingState.tsx`, `frontend/src/components/erp/ERPErrorState.tsx`, `frontend/src/components/erp/ERPEmptyState.tsx`
- ERP status chips: `frontend/src/components/erp/ERPStatusBadge.tsx`

### 5) Components created

- None (Phase 7 is composition-only: swap to ERP wrappers + spacing/section hierarchy polish where already present).

### 6) Subscription services/API contracts preserved

- No endpoint path changes, request param changes, or response normalization changes.
- No changes to subscription/contract services; UI wrappers only (examples):
  - `frontend/src/services/subscriptions.ts`, `frontend/src/services/subscriptions/*`
  - `frontend/src/services/subscription-requests.ts`
  - `frontend/src/services/customer/*` subscription register/detail services
  - `frontend/src/services/partner/*` subscription register/detail services

### 7) EMI/lucky ID/batch/waiver safety confirmation

- No changes to EMI calculation logic, EMI preview behavior, schedule derivation, or due-date logic.
- No changes to lucky ID selection/assignment rules.
- No changes to batch lifecycle interpretation.
- No changes to winner/waiver meaning (future EMI waiver only) or how waiver states are displayed.

### 8) Auth/role safety confirmation

- No changes to JWT/session handling, refresh flow, logout, redirects, middleware, or `RoleGuard`.
- No changes that expand customer/partner visibility into admin-only contract data.

### 9) Financial/audit safety confirmation

- No changes to payment posting, reversal behavior, commission logic, payout logic, ledger behavior, reconciliation behavior, accounting posting, or audit behavior.
- Contract desk surfaces remain read-first; mutation semantics and handlers remain unchanged where they exist.

### 10) Duplicate partner commissions route status

- Preserved unchanged (explicit policy):
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 11) Remaining subscription UI gaps

- `/admin/reports/contracts` is still on the shared report surface; consider a dedicated “Reports surfaces” pass to align reporting header/filters to ERP without touching report query semantics.
- Consider a dedicated “contract detail section hierarchy pass” for any remaining large contract detail surfaces that still rely on legacy panels (keep handlers unchanged).

### 12) Next recommended phase

- Phase 8 — Batches / Lucky IDs / lucky draw (read-only first; keep draw execution/mutations manual-review).

---

## Phase 8 batches lucky draw transformation result (2026-05-20)

Scope: **Frontend UI only** for Batches / Lucky IDs / Lucky Draw SAFE pages.  
Non-goals (enforced): **no backend changes**, **no API contract changes**, **no auth/session/RoleGuard changes**, **no route moves/renames/deletes**, **no invented batches/lucky IDs/winners/draw results**, **no permission weakening**, **no handler/validation/submit changes**.

### 1) Batch/lucky draw routes touched

- `/admin/batches` (SAFE_LAYOUT_ONLY)
- `/admin/batches/create` (SAFE_AUTO)
- `/admin/batches/[id]` (SAFE_AUTO)
- `/admin/batches/[id]/edit` (SAFE_AUTO)
- `/admin/batches/[id]/control-center` (SAFE_LAYOUT_ONLY; wrapper-only)
- `/admin/lucky-ids` (SAFE_LAYOUT_ONLY)
- `/admin/lucky-ids/[id]` (SAFE_AUTO)
- `/admin/lucky-ids/[id]/edit` (SAFE_AUTO)
- `/admin/bi/batches` (SAFE_AUTO; read-only analytics)

### 2) Batch/lucky draw routes deferred

Deferred by policy because these are draw execution/mutation and verification-critical surfaces (MANUAL_REVIEW):

- `/admin/lucky-draw` (MANUAL_REVIEW)
- `/admin/lucky-draw/history` (MANUAL_REVIEW)
- `/admin/lucky-draws` (MANUAL_REVIEW)
- `/admin/lucky-draws/create` (MANUAL_REVIEW)
- `/admin/lucky-draws/[id]` (MANUAL_REVIEW)
- `/admin/lucky-draws/[id]/reveal` (MANUAL_REVIEW)

Also intentionally left unchanged:

- `/admin/batches/[id]/generate-lucky-ids` (SAFE_AUTO) — redirect-only route; no UI surface to transform.

### 3) Pages transformed by migrationClass

- SAFE_AUTO:
  - `/admin/batches/create`
  - `/admin/batches/[id]`
  - `/admin/batches/[id]/edit`
  - `/admin/lucky-ids/[id]`
  - `/admin/lucky-ids/[id]/edit`
  - `/admin/bi/batches`
- SAFE_LAYOUT_ONLY:
  - `/admin/batches`
  - `/admin/batches/[id]/control-center` (wrapper-only, handlers preserved)
  - `/admin/lucky-ids`

### 4) Components reused

- ERP shell/states: `frontend/src/components/erp/ERPPageShell.tsx`, `frontend/src/components/erp/ERPLoadingState.tsx`, `frontend/src/components/erp/ERPErrorState.tsx`, `frontend/src/components/erp/ERPEmptyState.tsx`
- ERP status chips: `frontend/src/components/erp/ERPStatusBadge.tsx`
- ERP toolbars/sections: `frontend/src/components/erp/ERPDataToolbar.tsx`, `frontend/src/components/erp/ERPSectionShell.tsx`

### 5) Components created

- None (Phase 8 is composition-only: adopt shared ERP wrappers + toolbar/section framing).

### 6) Batch/lucky draw services/API contracts preserved

- No endpoint path changes, request parameter changes, or response-shape assumptions added.
- No new service calls added; existing `apiFetch` usage and existing service modules remain unchanged (examples):
  - `frontend/src/services/batches/*`
  - `frontend/src/services/draws/*`

### 7) Lucky ID/draw/winner/waiver safety confirmation

- No changes to Lucky ID allocation rules, assignment behavior, or status meaning.
- No changes to draw commit/reveal/verification display logic or seed/hash behavior.
- No changes to winner selection behavior or winner waiver meaning (future EMI waiver only).
- `/admin/batches/[id]/control-center` remains behavior-identical; only wrapper/state primitives were swapped.

### 8) Auth/role safety confirmation

- No changes to JWT/session handling, refresh flow, logout, redirects, middleware, or `RoleGuard`.
- No changes that expand any role’s visibility into other-role batch/draw data.

### 9) Financial/audit safety confirmation

- No changes to EMI logic, payment posting, commission, payout, ledger, reconciliation, accounting posting, or audit behavior.
- No new derived financial numbers were introduced; all numbers shown remain sourced from existing backend payloads.

### 10) Duplicate partner commissions route status

- Preserved unchanged (explicit policy):
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 11) Remaining batch/lucky draw UI gaps

- Lucky draw execution surfaces remain deferred (MANUAL_REVIEW) and still use legacy framing; do not auto-migrate.
- If/when migrating draw pages, do it as a dedicated manual-review pass with strict “no handler” constraints.

### 12) Next recommended phase

- Phase 9 — Cashier POS / counter workspace (visual-only; keep submit/mutation behavior strict).

---

## Phase 9 cashier POS counter transformation result (2026-05-21)

Scope: **Frontend UI only** for Cashier POS / Counter Workspace SAFE pages.  
Non-goals (enforced): **no backend changes**, **no API contract changes**, **no auth/session/RoleGuard changes**, **no route moves/renames/deletes**, **no permission changes**, **no submit/validation/handler changes**, **no invented payments/receipts/counters**.

### 1) Cashier routes touched

- `/cashier` (SAFE_LAYOUT_ONLY)
- `/cashier/notifications` (SAFE_AUTO)
- `/cashier/billing/direct-sale` (SAFE_AUTO)

### 2) Cashier routes deferred

- `/cashier/collect` (MANUAL_REVIEW) — collection submit + receipt generation surface; keep manual-review.
- `/cashier/payments` (MANUAL_REVIEW) — cashier payment register/history; keep manual-review.
- `/cashier/payments/[id]` (MANUAL_REVIEW) — payment detail/audit timeline; keep manual-review.
- `/cashier/billing` (SAFE_AUTO) — delegates to `/cashier/collect` page component; deferred to avoid touching collection submit UI.

### 3) Pages transformed by migrationClass

- SAFE_AUTO:
  - `/cashier/notifications`
  - `/cashier/billing/direct-sale`
- SAFE_LAYOUT_ONLY:
  - `/cashier`

### 4) Components reused

- ERP shell/states: `frontend/src/components/erp/ERPPageShell.tsx`, `frontend/src/components/erp/ERPLoadingState.tsx`, `frontend/src/components/erp/ERPErrorState.tsx`, `frontend/src/components/erp/ERPEmptyState.tsx`
- ERP framing: `frontend/src/components/erp/ERPRegisterShell.tsx`, `frontend/src/components/erp/ERPSectionShell.tsx`, `frontend/src/components/erp/ERPDataToolbar.tsx`
- ERP chips/notes: `frontend/src/components/erp/ERPStatusBadge.tsx`, `frontend/src/components/erp/ERPAuditNote.tsx`

### 5) Components created

- None (Phase 9 is composition-only: adopt shared ERP wrappers and register/section framing).

### 6) Cashier services/API contracts preserved

- No endpoint path changes, request parameter changes, or response-shape assumptions added.
- No new service calls introduced; existing service modules remain the source of truth:
  - `frontend/src/services/cashier/index.ts` (cashier dashboard/collect/search/payment history endpoints)
  - `frontend/src/services/notifications.ts` (cashier notifications)
  - `frontend/src/services/direct-sale-workspace.ts` (cashier direct-sale billing search/preview endpoints)

### 7) Payment/collection/receipt safety confirmation

- No changes to collection submit handlers, payment posting behavior, receipt generation behavior, validation behavior, EMI search behavior, or direct-sale collection behavior.
- MANUAL_REVIEW cashier payment and collection routes remain untouched.

### 8) Auth/role safety confirmation

- No changes to JWT/session handling, refresh flow, logout, redirects, middleware, or `RoleGuard`.
- No changes that expand cashier visibility outside existing cashier-permitted contracts.

### 9) Financial/audit safety confirmation

- No changes to EMI logic, waiver/winner behavior, commission, payout, ledger, reconciliation, accounting posting, or audit behavior.
- UI changes remain wrapper/layout/state-only on SAFE pages.

### 10) Duplicate partner commissions route status

- Preserved unchanged (explicit policy):
  - `frontend/src/app/(dashboard)/partner/commissions/`
  - `frontend/src/app/(dashboard)/partner/commisions/`

### 11) Remaining cashier UI gaps

- Cashier collection and payment-history/detail surfaces remain on legacy framing (MANUAL_REVIEW); migrate only with explicit “no handler/submit changes” constraints.
- Consider adding consistent register framing and audit notes to `/cashier/payments*` only after manual review of action visibility and reversal/void semantics.

### 12) Fast frontend checks

- `cd frontend && npm run lint`: ✅ pass
- `cd frontend && npm run typecheck`: ✅ pass
- `cd frontend && npm run build`: ✅ pass
- `cd frontend && npm run check:routes`: ✅ pass (393 routes, 11 compatibility redirects)

### 13) Next recommended phase

- Phase 10 — Payments / receipts / collections (strict manual-review for posting/mutations; SAFE views first).
