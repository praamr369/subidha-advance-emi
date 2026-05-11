# Page layout taxonomy (SUBIDHA CORE frontend)

**Phase 1 — documentation only.** Defines shared page archetypes for future layout alignment. Examples cite **actual routes** from this repository.

## Type reference

### executive_dashboard

- **Purpose:** Role landing that answers “what needs attention today” with a small set of trustworthy signals and deep links into work queues.
- **When to use:** Top-level `/admin`, `/customer`, `/partner`, `/vendor`, or `/cashier` home surfaces; executive command views.
- **When not to use:** Dense data grids, long forms, or ledger drill-downs (use register_list / transaction_form / detail_page).
- **KPIs allowed:** Allowed: few, stable metrics tied to posture objects (collections, overdue, draw readiness). Avoid vanity counts.
- **Primary layout:** `PortalPage` or role shell (`ExecutiveDashboardShell`, `SelfServicePageShell`, `PartnerVendorWorkspaceShell`) + `DashboardWidgetBoard` / `WorkspaceSection` + `MetricStrip`.
- **Mobile rule:** Prioritize single-column stacks; collapse widget boards; keep one primary CTA visible.
- **Dark-mode rule:** Follow global tokens; charts and chips must remain legible on dark surfaces.
- **Examples in this repo:** `/admin`, `/customer`, `/partner`, `/vendor`, `/cashier`
- **Anti-patterns:** Do not duplicate full register tables on the dashboard. Do not stack unrelated KPI grids above the fold.

### operations_workspace

- **Purpose:** Day-to-day operational screen: filters, bulk-safe actions, and contextual panels for staff.
- **When to use:** Most `/admin/*` modules (inventory, CRM, service desk, finance hubs except pure reports).
- **When not to use:** Customer self-service or public marketing pages.
- **KPIs allowed:** Allowed sparingly for queue depth / exposure when it drives the next action.
- **Primary layout:** `PortalPage` + optional `WorkflowCard` row + main workspace (often custom sections, sometimes `DataTableShell`).
- **Mobile rule:** Filters collapse to sheet/drawer; defer wide tables to horizontal scroll with care.
- **Dark-mode rule:** Use surface tokens for elevated cards; keep destructive actions visually distinct.
- **Examples in this repo:** `/admin/operations`, `/admin/inventory/workspace`, `/admin/service-desk`
- **Anti-patterns:** Avoid turning every workspace into a KPI wall before the primary task UI.

### register_list

- **Purpose:** Searchable, paginated ledger of entities (customers, payments, products, tickets).
- **When to use:** Pages whose main artifact is a table with row actions.
- **When not to use:** Multi-step wizards or document detail (use transaction_form / detail_page).
- **KPIs allowed:** Optional small header stats (e.g. list size, open count) — not a full analytics board.
- **Primary layout:** `PortalPage` + `DataTableShell` + `DetailPanel` pattern where used.
- **Mobile rule:** `MobileSafeTable` or card list; preserve sort/filter affordances.
- **Dark-mode rule:** Zebra rows and borders must retain contrast.
- **Examples in this repo:** `/admin/customers`, `/admin/payments`, `/admin/audit-logs`
- **Anti-patterns:** Do not wrap non-tabular content solely for visual padding in `DataTableShell`.

### transaction_form

- **Purpose:** Create or edit a business object with validation, dependent fields, and explicit submit lifecycle.
- **When to use:** Paths containing `/create`, `/edit`, imports, or structured wizards.
- **When not to use:** Read-only audit trails.
- **KPIs allowed:** Generally **no**; show derived totals inline near fields instead of KPI grids.
- **Primary layout:** `PortalPage` with narrow max width + `FormSection` / field groups.
- **Mobile rule:** Single column; sticky submit where safe.
- **Dark-mode rule:** Input borders and error text must meet contrast.
- **Examples in this repo:** `/admin/subscriptions/create`, `/admin/batches/create`, `/admin/products/create`
- **Anti-patterns:** Avoid `QuickActionGrid` of KPIs on pure forms unless required for verification summaries.

### detail_page

- **Purpose:** Single-record drill-down: timeline, related lists, and scoped actions.
- **When to use:** Dynamic `[id]`, `[caseId]`, `[slug]`, etc. detail routes.
- **When not to use:** List landing for the same entity type.
- **KPIs allowed:** Allowed: record-level summary chips (`PortalPage` `stats`) — keep tight (≤4).
- **Primary layout:** `PortalPage` + tabs/sections; optional embedded `DataTableShell` for child lists.
- **Mobile rule:** Stack sections; pin key record metadata at top.
- **Dark-mode rule:** Separate timeline and surface backgrounds for scanability.
- **Examples in this repo:** `/admin/customers/[id]`, `/admin/payments/[id]`, `/customer/subscriptions/[id]`
- **Anti-patterns:** Avoid embedding unrelated registers that belong on their own list routes.

### approval_queue

- **Purpose:** Explicit queue of items needing a decision with audit-friendly actions.
- **When to use:** Subscription requests, collection requests, partner payment requests.
- **When not to use:** General CRM prospect lists without a decision workflow.
- **KPIs allowed:** Counts of pending / overdue approvals are appropriate.
- **Primary layout:** `PortalPage` + table or split view + status badges.
- **Mobile rule:** Card per item with primary approve/reject pattern.
- **Dark-mode rule:** Warning/danger tones for blocked items.
- **Examples in this repo:** `/admin/subscription-requests`, `/partner/subscription-requests`, `/admin/partners/collection-requests`
- **Anti-patterns:** Do not mix unrelated entity types in one approval table without strong filtering.

### setup_checklist

- **Purpose:** Guided business setup: ordered steps, completion states, links into configuration routes.
- **When to use:** Business setup checklist and similar onboarding flows.
- **When not to use:** Daily operational queues.
- **KPIs allowed:** Completion percentage / step counts only.
- **Primary layout:** `PortalPage` or `PageHeader` + checklist components.
- **Mobile rule:** Stepper or accordion per section.
- **Dark-mode rule:** Completed vs pending steps need distinct chips.
- **Examples in this repo:** `/admin/settings/business-setup/checklist`
- **Anti-patterns:** Avoid embedding heavy registers; link out instead.

### accounting_control

- **Purpose:** Financial period control, ledgers, statements, and reconciliation surfaces.
- **When to use:** Accounting module: journals, TB/BS/PL, reconciliation, GST registers.
- **When not to use:** Marketing or CRM list pages.
- **KPIs allowed:** Balances and period locks — yes; marketing funnels — no.
- **Primary layout:** `PortalPage` + dense tables + export actions.
- **Mobile rule:** Read-only summaries first; defer full grids to desktop where possible.
- **Dark-mode rule:** Numeric columns right-aligned; use tabular nums.
- **Examples in this repo:** `/admin/accounting`, `/admin/accounting/reports/trial-balance`, `/admin/accounting/reconciliation`
- **Anti-patterns:** Never use KPI tiles as a substitute for double-entry detail.

### cashier_workflow

- **Purpose:** Fast, interruption-friendly flows for collection and payment verification at counter.
- **When to use:** All `/cashier/*` routes.
- **When not to use:** Long-running analytics.
- **KPIs allowed:** Session totals and queue depth — yes.
- **Primary layout:** `PortalPage` tuned for touch / rapid entry; large targets.
- **Mobile rule:** Assume phone or tablet at desk.
- **Dark-mode rule:** High contrast for amount entry feedback.
- **Examples in this repo:** `/cashier`, `/cashier/collect`, `/cashier/payments`
- **Anti-patterns:** Avoid nested navigation depth; minimize scroll to primary action.

### customer_self_service

- **Purpose:** Customer-readable status for subscriptions, EMIs, deliveries, and documents.
- **When to use:** `/customer/*` except staff-only hybrids (there should be none in normal RBAC).
- **When not to use:** Admin registers.
- **KPIs allowed:** Personal posture (outstanding, next EMI) — yes; firm-wide KPIs — no.
- **Primary layout:** `SelfServicePageShell` + `DashboardWidgetBoard` on home; `PortalPage` on inner pages.
- **Mobile rule:** First-class; customers primarily phone users.
- **Dark-mode rule:** Maintain readable money formatting.
- **Examples in this repo:** `/customer`, `/customer/payments`, `/customer/subscriptions`
- **Anti-patterns:** Do not expose other customers’ data or staff-only actions.

### partner_vendor_workspace

- **Purpose:** Partner or vendor operational views: collections, quotes, payouts, ledgers scoped to the actor.
- **When to use:** `/partner/*`, `/vendor/*`.
- **When not to use:** Admin global registers (even if similar data exists server-side).
- **KPIs allowed:** Scoped totals (my collections, my outstanding) — yes.
- **Primary layout:** `PartnerVendorWorkspaceShell` + `PortalPage` on dashboards; inner pages vary.
- **Mobile rule:** Partner field staff: prioritize collections and customer lookup.
- **Dark-mode rule:** Same token discipline as admin.
- **Examples in this repo:** `/partner`, `/partner/collections`, `/vendor/orders`
- **Anti-patterns:** Avoid admin-only finance controls in partner/vendor UI.

### report_analytics

- **Purpose:** Read-mostly analysis: exports, charts, cohort views, BI snapshots.
- **When to use:** `/admin/reports/*`, `/admin/analytics/*`, `/admin/bi/*`, `reports-center`.
- **When not to use:** Operational edits (posting payments, approving requests).
- **KPIs allowed:** Yes — this is the appropriate place for dense metrics.
- **Primary layout:** `PortalPage` + chart/table combinations; export footers.
- **Mobile rule:** Summaries + link to export; charts may defer.
- **Dark-mode rule:** Chart palettes must be tested in dark mode.
- **Examples in this repo:** `/admin/reports`, `/admin/bi`, `/admin/analytics/risk-monitor`
- **Anti-patterns:** Do not perform money-moving actions hidden inside analytics pages.

### public_marketing

- **Purpose:** Unauthenticated marketing, education, and trust content.
- **When to use:** `(public)/**` routes.
- **When not to use:** Authenticated dashboards.
- **KPIs allowed:** Only product marketing stats (non-financial).
- **Primary layout:** Marketing layouts / `PageHeader` patterns — varies.
- **Mobile rule:** SEO pages must be responsive.
- **Dark-mode rule:** Optional; follow brand guidelines.
- **Examples in this repo:** `/`, `/about`, `/lucky-plan`, `/how-it-works`
- **Anti-patterns:** Never show customer-specific financial data.

### auth_flow

- **Purpose:** Login, registration, password recovery, logout.
- **When to use:** `(auth)/**` routes.
- **When not to use:** Business operations.
- **KPIs allowed:** No business KPIs.
- **Primary layout:** Centered auth card layouts.
- **Mobile rule:** Single column forms.
- **Dark-mode rule:** Auth backgrounds should not reduce field readability.
- **Examples in this repo:** `/login`, `/register`, `/reset-password`, `/logout`
- **Anti-patterns:** Do not preload heavy dashboards on auth pages.

### system_utility

- **Purpose:** Cross-cutting utility screens (unauthorized, global search shells if not tied to a domain).
- **When to use:** `/unauthorized`, narrow utility routes.
- **When not to use:** Domain registers.
- **KPIs allowed:** No.
- **Primary layout:** Minimal shells.
- **Mobile rule:** Simple message + navigation recovery.
- **Dark-mode rule:** Neutral surfaces.
- **Examples in this repo:** `/unauthorized`, `/admin/global-search`
- **Anti-patterns:** Do not grow utility routes into full modules without renaming and RBAC review.

## KPI / card overuse findings (static inspection)

This section flags **patterns that often correlate with visual KPI density**, based on imports and props in `page.tsx` files. It is not a judgment of business correctness.

### PortalPage `stats` usage

Files passing `stats={...}` or `stats={var}` to `PortalPage`: **138** routes.

Examples (first 15 alphabetically by route):
- `/admin/accounting`
- `/admin/accounting/assets`
- `/admin/accounting/attendance`
- `/admin/accounting/books`
- `/admin/accounting/bridges`
- `/admin/accounting/chart-of-accounts`
- `/admin/accounting/depreciation`
- `/admin/accounting/expense-claims`
- `/admin/accounting/expenses`
- `/admin/accounting/exports`
- `/admin/accounting/exports/itr-pack`
- `/admin/accounting/gst`
- `/admin/accounting/gst/credit-notes`
- `/admin/accounting/gst/debit-notes`
- `/admin/accounting/gst/tax-invoices`

### `KpiCard` / `QuickActionGrid` / `WorkflowCard`

Routes importing `KpiCard` and/or `WorkflowCard`: **21**

- `/admin/batches` — KpiCard, QuickActionGrid
- `/admin/batches/[id]` — KpiCard, QuickActionGrid
- `/admin/batches/[id]/control-center` — KpiCard, WorkflowCard, QuickActionGrid
- `/admin/collections` — KpiCard, WorkflowCard, QuickActionGrid
- `/admin/customers/[id]` — KpiCard, QuickActionGrid
- `/admin/emis/overdue` — KpiCard, QuickActionGrid
- `/admin/finance` — KpiCard, QuickActionGrid
- `/admin/hr/staff` — KpiCard, WorkflowCard, QuickActionGrid
- `/admin/hr/staff-documents` — KpiCard, WorkflowCard, QuickActionGrid
- `/admin/hr/staff/[id]` — KpiCard, WorkflowCard, QuickActionGrid
- `/admin/lucky-ids` — KpiCard, QuickActionGrid
- `/admin/products` — KpiCard, QuickActionGrid
- `/admin/products/create` — KpiCard, QuickActionGrid
- `/admin/products/import` — KpiCard, QuickActionGrid
- `/admin/reconciliation` — KpiCard, QuickActionGrid
- `/admin/subscriptions` — WorkflowCard
- `/cashier/payments` — KpiCard, QuickActionGrid
- `/cashier/payments/[id]` — WorkflowCard, QuickActionGrid
- `/customer/profile` — KpiCard, QuickActionGrid
- `/partner/collections` — KpiCard, WorkflowCard, QuickActionGrid
- `/partner/customers` — KpiCard, WorkflowCard, QuickActionGrid

### `WorkspaceCardsPage`

Routes using `WorkspaceCardsPage`: **7**
- `/admin/delivery` → `frontend/src/app/(dashboard)/admin/delivery/page.tsx`
- `/admin/delivery/workspace` → `frontend/src/app/(dashboard)/admin/delivery/workspace/page.tsx`
- `/admin/finance/workspace` → `frontend/src/app/(dashboard)/admin/finance/workspace/page.tsx`
- `/admin/inventory/workspace` → `frontend/src/app/(dashboard)/admin/inventory/workspace/page.tsx`
- `/admin/partners/workspace` → `frontend/src/app/(dashboard)/admin/partners/workspace/page.tsx`
- `/admin/products/workspace` → `frontend/src/app/(dashboard)/admin/products/workspace/page.tsx`
- `/admin/service` → `frontend/src/app/(dashboard)/admin/service/page.tsx`

### `WidgetShell`

Routes importing `WidgetShell`: **0**

_No `page.tsx` files import `WidgetShell` directly._

`WidgetShell` is implemented in `frontend/src/components/admin/dashboard/WidgetShell.tsx` and is composed inside `frontend/src/components/admin/dashboard/AdminOperationsDashboard.tsx`. **Static search shows no `page.tsx` (or other feature modules) importing `AdminOperationsDashboard` today**, so this is primarily a **component-layer** KPI shell to be aware of for future wiring or cleanup. Separately, **`DashboardWidgetBoard`** on role home pages still centralizes much widget/KPI layout even when `WidgetShell` is not imported at the route layer.

### `DataTableShell` on non-table-first pages (heuristic)

Total routes with `DataTableShell`: **33**. Routes where **recommended type** is not `register_list` / `operations_workspace` / `report_analytics` / `accounting_control` / `approval_queue` / `cashier_workflow` / `partner_vendor_workspace` / `customer_self_service`: **6** (review manually — some detail pages correctly embed child tables).

- `/admin/batches/[id]` (recommended: `detail_page`)
- `/admin/hr/staff/[id]` (recommended: `detail_page`)
- `/admin/products/[id]` (recommended: `detail_page`)
- `/admin/products/import` (recommended: `transaction_form`)
- `/admin/subscriptions/[id]` (recommended: `detail_page`)
- `/customer/subscriptions/[id]` (recommended: `detail_page`)

### Customer vs partner dashboard classification note

- **Customer home** `/customer` uses `SelfServicePageShell` + `DashboardWidgetBoard` (see imports), not the same shell as admin.
- **Partner home** `/partner` uses `PartnerVendorWorkspaceShell` + `PortalPage` + dashboard widgets — classify as **partner_vendor_workspace** / executive-style landing for partners.
