# Page layout taxonomy

This document defines **layout intent** for SUBIDHA CORE frontend pages. It complements `page-route-inventory.md` and the reusable shells in `frontend/src/components/layout/page-shells.tsx`.

Shared shells are **layout-only**: they do not fetch data, enforce roles, or inject content.

---

## `executive_dashboard`

| | |
| --- | --- |
| **Purpose** | Strategic overview for leadership: today’s risk, queues, and attention items—not a full ERP grid. |
| **When to use** | `/admin` and similar single-pane executive summaries. |
| **When not to use** | Registers, transaction posting, or customer self-service. |
| **KPIs allowed?** | Yes, **limited** (4–8 meaningful metrics from real dashboard endpoints). |
| **Primary structure** | Time context → priority queues / alerts → deep links to workspaces. |
| **Examples** | `/admin` (Executive Dashboard). |
| **Anti-patterns** | Duplicating the same metrics as KPI cards *and* stat strip *and* widget grids; 15+ generic counters. |
| **Mobile** | Stack sections vertically; keep queue lists scrollable with `min-w-0`. |
| **Dark mode** | Use semantic tokens (`bg-card`, `text-foreground`, `border-border`); avoid hard-coded light-only gradients for critical text. |

---

## `operations_workspace`

| | |
| --- | --- |
| **Purpose** | Day-to-day internal operations: deliveries, finance tiles, command surfaces. |
| **When to use** | Multi-lane or card-board ops pages (delivery register, finance workspace). |
| **When not to use** | Customer/partner scoped pages; pure accounting control. |
| **KPIs allowed?** | Sparingly; prefer lane counts and status filters from real payloads. |
| **Primary structure** | Filters → lanes / board → detail drill-down. |
| **Examples** | `/admin/deliveries`, `/admin/finance/workspace`. |
| **Anti-patterns** | Same four KPI cards on every ops page regardless of task. |
| **Mobile** | Horizontal scroll only inside intentional containers; outer page `min-w-0`. |
| **Dark mode** | Same as above. |

---

## `register_list`

| | |
| --- | --- |
| **Purpose** | Search-first lists: customers, subscriptions, payments, inventory rows. |
| **When to use** | Any high-volume tabular register. |
| **When not to use** | When the primary task is a single form (use `transaction_form`). |
| **KPIs allowed?** | Prefer header **stats** strip only; avoid a second KPI grid repeating the same numbers. |
| **Primary structure** | Search + filters → table → row actions / export. |
| **Examples** | `/admin/customers`, `/admin/subscriptions` (register mode), `/admin/payments`. |
| **Anti-patterns** | KPI grid above the register that duplicates `PortalPage` stats. |
| **Mobile** | Wrap tables in `overflow-x-auto` / `MobileSafeTable` patterns. |
| **Dark mode** | Table borders via `border-border`; keep focus rings visible. |

---

## `transaction_form`

| | |
| --- | --- |
| **Purpose** | Collect or post a single business action (create payment, create entity). |
| **When to use** | `/create`, `/new`, wizard-style flows. |
| **When not to use** | Browsing hundreds of rows. |
| **KPIs allowed?** | Generally **no**; optional inline validation summaries only. |
| **Primary structure** | Form sections → primary action → confirmation / receipt. |
| **Examples** | `/admin/payments/create`, subscription create flows. |
| **Anti-patterns** | Dashboard KPIs above a long form. |
| **Mobile** | Full-width fields; sticky primary action where appropriate. |
| **Dark mode** | Input backgrounds `bg-background`; errors `destructive` tokens. |

---

## `detail_page`

| | |
| --- | --- |
| **Purpose** | Single object context: tabs, timeline, related lists. |
| **When to use** | `/admin/customers/[id]`, `/admin/subscriptions/[id]`, etc. |
| **When not to use** | List landing pages. |
| **KPIs allowed?** | Only when they summarize **this** object (not global business KPIs). |
| **Primary structure** | Object header → tabs → timeline / related tables. |
| **Examples** | Dynamic `[id]` routes under admin/partner/customer. |
| **Anti-patterns** | Six KPI cards that duplicate fields already in the header. |
| **Mobile** | Tabs as scrollable chips; avoid nested interactive controls. |
| **Dark mode** | Detail panels use `bg-card` / `border-border`. |

---

## `approval_queue`

| | |
| --- | --- |
| **Purpose** | Review and approve/reject linear workflows. |
| **When to use** | Subscription requests, collection requests, support queues. |
| **When not to use** | Generic CRUD lists without an approval state machine. |
| **KPIs allowed?** | Queue depth / SLA-style counts from real APIs. |
| **Primary structure** | Queue summary → filter → row actions → detail drawer. |
| **Examples** | `/admin/subscription-requests`, partner request queues. |
| **Anti-patterns** | Unrelated finance KPIs above a narrow approval list. |
| **Mobile** | Card-per-row fallback where tables are cramped. |
| **Dark mode** | Status badges must meet contrast in both themes. |

---

## `setup_checklist`

| | |
| --- | --- |
| **Purpose** | Onboarding / configuration: blockers, missing mappings, guided steps. |
| **When to use** | Accounting setup, business setup guides. |
| **When not to use** | Day-to-day transactional pages. |
| **KPIs allowed?** | Compact status (COA ready, journal ready)—not decorative trend cards. |
| **Primary structure** | **Blockers first** → checklist → mapping/table actions. |
| **Examples** | `/admin/accounting/setup`, `/admin/settings/business-setup/chart-accounts`. |
| **Anti-patterns** | Hiding missing mappings below unrelated KPI grids. |
| **Mobile** | Blocker callouts full width; tables `overflow-x-auto`. |
| **Dark mode** | Warning panels use theme-aware amber/red mixes. |

---

## `accounting_control`

| | |
| --- | --- |
| **Purpose** | Masters, mappings, journals, COA—**control** not “dashboard vanity”. |
| **When to use** | Chart of accounts, accounting overview, books. |
| **When not to use** | Cashier collection; customer balances marketing. |
| **KPIs allowed?** | **Compact** readiness chips (mappings x/y, journal blocked/ready)—no fake balances. |
| **Primary structure** | Directory / filters → master table → drawers for create/edit. |
| **Examples** | `/admin/accounting/chart-of-accounts`. |
| **Anti-patterns** | Eight header KPIs repeating the same totals as the table below. |
| **Mobile** | Enterprise tables horizontally scroll inside a shell. |
| **Dark mode** | Accounting notices use shared `AccountingNotice` tones. |

---

## `cashier_workflow`

| | |
| --- | --- |
| **Purpose** | Fast collection: search → select row → post → receipt. |
| **When to use** | `/cashier/collect`. |
| **When not to use** | Admin analytics. |
| **KPIs allowed?** | **Minimal**; header stats for the active queue only—no dashboard grid. |
| **Primary structure** | Universal search → workflow toggle → search form → collection panel → receipt. |
| **Examples** | `/cashier/collect`. |
| **Anti-patterns** | Four KPI cards + workflow cards duplicating header stats. |
| **Mobile** | Sticky bottom actions (existing pattern); safe-area padding. |
| **Dark mode** | Collection panel surfaces use `--surface-*` variables. |

---

## `customer_self_service`

| | |
| --- | --- |
| **Purpose** | Customer’s own contracts, payments, support—no internal ops noise. |
| **When to use** | `/customer` and customer sub-routes. |
| **When not to use** | Admin registers. |
| **KPIs allowed?** | Simple **at-a-glance** metrics; prefer `MetricStrip` / definition lists over duplicate KPI grids. |
| **Primary structure** | Quick links → personal summary → subscription/payment widgets. |
| **Examples** | `/customer`, `/customer/subscriptions`, `/customer/payments`. |
| **Anti-patterns** | Two stacked grids of the same EMI totals (KPI + settlement card). |
| **Mobile** | Same as register_list for tables. |
| **Dark mode** | Customer marketing gradients must keep text readable (slate on light panels is acceptable if contrast holds). |

---

## `partner_vendor_workspace`

| | |
| --- | --- |
| **Purpose** | Partner/vendor scoped: own customers, commissions, quotes—**never** admin-only links. |
| **When to use** | `/partner`, `/vendor`, scoped sub-routes. |
| **When not to use** | Admin financial control centers. |
| **KPIs allowed?** | Only **scoped** metrics from partner/vendor APIs. |
| **Primary structure** | Scoped stats strip → lane widgets → tables. |
| **Examples** | `/partner`, `/vendor`. |
| **Anti-patterns** | Eight KPI tiles when four header stats + one summary line suffice. |
| **Mobile** | Touch-friendly action cards. |
| **Dark mode** | Use dashboard shell variables consistent with other roles. |

---

## `report_analytics`

| | |
| --- | --- |
| **Purpose** | Explore, chart, export, drill down. |
| **When to use** | `/admin/reports/*`, `/admin/bi/*`, analytics routes. |
| **When not to use** | Operational registers (unless the page is explicitly a report). |
| **KPIs allowed?** | Yes when **report-specific** and endpoint-backed. |
| **Primary structure** | Filters → chart/table → export → drilldown links. |
| **Examples** | `/admin/bi/cashflow`, report sub-routes. |
| **Anti-patterns** | KPI strip with no tie to the chart’s filter window. |
| **Mobile** | Charts stack; tables scroll horizontally inside containers. |
| **Dark mode** | Chart chrome follows CSS variables where applicable. |

---

## `public_marketing`

| | |
| --- | --- |
| **Purpose** | Trust, product story, published winners—**not** ERP dashboards. |
| **When to use** | `(public)/*` marketing pages. |
| **When not to use** | Authenticated workspaces. |
| **KPIs allowed?** | Only **public** stats from real endpoints (e.g. `getPublicStats`). |
| **Primary structure** | Hero → trust → product/plan → CTA. |
| **Examples** | `/`, `/lucky-plan`, `/winners`. |
| **Anti-patterns** | Admin-style KPI grids on the marketing home page. |
| **Mobile** | Readable line length; no horizontal page overflow. |
| **Dark mode** | Public layout already uses theme tokens; `PublicMarketingShell` wraps `<main>`. |

---

## `auth_flow`

| | |
| --- | --- |
| **Purpose** | Login, register, password reset. |
| **When to use** | `(auth)/*`. |
| **When not to use** | Post-login dashboards. |
| **KPIs allowed?** | No. |
| **Primary structure** | Branding → form → helper links. |
| **Examples** | `/login`, `/register`. |
| **Anti-patterns** | Operational KPIs on login. |
| **Mobile** | Large tap targets; keyboard-safe forms. |
| **Dark mode** | Form fields use `bg-background`. |

---

## `system_utility`

| | |
| --- | --- |
| **Purpose** | Settings, unauthorized, cross-role utilities. |
| **When to use** | `/unauthorized`, `/settings`, small utility pages. |
| **When not to use** | Core business workflows. |
| **KPIs allowed?** | No. |
| **Primary structure** | Minimal explanation + single action. |
| **Examples** | `/unauthorized`. |
| **Anti-patterns** | Embedding admin widgets. |
| **Mobile** | Centered, narrow column. |
| **Dark mode** | Standard semantic colors. |

---

## KPI / card overuse findings

These pages previously layered **`PortalPage` stats**, **`QuickActionGrid` + `KpiCard`**, and/or **`WorkflowCard`** with **redundant** metrics—fine for a prototype, noisy for daily operations. This pass **removed or replaced** duplicate KPI grids with register-first layouts, definition lists, or summary lines while **keeping** real endpoint-backed numbers.

| Route | Overused pattern | Why not operationally useful | Replacement in this pass |
| --- | --- | --- | --- |
| `/admin/customers` | Control lanes **before** search + duplicate KPI grid vs header stats | Staff need the register first; KPIs repeated visible/active/KYC | `RegistryPageShell`; search + table **before** lanes + import; removed KPI grid; import preview uses `<dl>` |
| `/admin/subscriptions` (register) | KPI row duplicating header + no lifecycle navigation | Same counts shown twice; lifecycle filtering is the real mental model | Lifecycle **pill nav**; removed “operational note” KPI panel; `RegistryPageShell` |
| `/admin/payments` | Double KPI strip + `WorkflowCard` amounts | Net/gross already in header stats; extra cards push filters below fold | `RegistryPageShell`; removed duplicate KPI blocks |
| `/cashier/collect` | `QuickActionGrid` of workflow KPIs | Duplicates header stats; slows scanning | `CashierWorkflowShell`; one-line counter sequence hint |
| `/customer` | Multiple `KpiCard` / `QuickActionGrid` layers | Same financial totals repeated in adjacent sections | `SelfServicePageShell`; KPI clusters → `<dl>` / text rows; removed redundant EMI KPI grid |
| `/vendor` | 8-tile `KpiCard` wall | Dense tiles for a small vendor team; many metrics belong in header strip | `PortalPage.stats` (4) + one prose summary line + link grid |
| `/admin/accounting/chart-of-accounts` | Long KPI band in header | COA page needs **readiness**, not a second dashboard | Reduced header stats to four **readiness-focused** values; `AccountingControlShell` |
| `/admin/accounting/setup` | Stats before visible blockers | Setup is **blocker-driven** | `SetupChecklistPageShell`; warnings + missing mappings **before** stat row |

**Intentionally unchanged (still card-heavy but justified)**

- Batch **control center** status cards (lock/draw/delivery)—tightly coupled to operational state machine.
- **Report / BI** pages where KPIs match the filtered report window.
- **Subscription workflow landing** (`/admin/subscriptions` with empty query) still uses `WorkflowCard` grid as a **navigator**, not a fake metrics dashboard.

---

## Related files

- `frontend/src/components/layout/page-shells.tsx` — reusable layout regions.
- `frontend/src/components/ui/operations.tsx` — `KpiCard`, `DataTableShell`, etc. (still valid when not duplicated).
- `frontend/src/components/ui/PortalPage.tsx` — header, breadcrumbs, optional `stats` strip.
