# Page layout taxonomy (SUBIDHA CORE frontend)

This document defines shared frontend page archetypes and the navigation rule for SUBIDHA CORE.

## Phase 9D navigation rule

Admin sidebar navigation is **parent-module-only**. The sidebar is not a route inventory and must not expose every register, detail route, create route, or filtered workflow.

Visible admin sidebar modules:

```text
Command Center
Sales & Contracts
Subscription EMI
Rent / Lease
Direct Sale
Accounting & Finance
Inventory
Manufacturing
CRM / Parties
HR & Staff
Service Desk
Delivery & Operations
Reports & Analysis
Settings
```

Child workflows belong inside their parent module cockpit pages through cards, sections, tabs, filters, breadcrumbs, command palette search, and quick actions.

Examples of child workflows that must live inside cockpit pages, not as sidebar-visible child links:

```text
Batch Register
Lucky ID Register
EMI Schedule / EMI Register
Winners
Waiver / Loss Report
Rent Monthly Demands
Security Deposits
Delivery Requests
```

Routes remain preserved. Compatibility routes remain preserved. This rule changes visibility and information architecture only; it does not delete App Router pages.

## Shell mapping

Typed layout-only shells live in `frontend/src/components/layout/page-shells.tsx`. They accept `ReactNode` slots, perform no data fetching, API calls, storage access, or role checks, and render nothing for omitted slots.

| Taxonomy page type | Shell component | When to use | KPI policy |
| --- | --- | --- | --- |
| `executive_dashboard` | `ExecutiveDashboardShell` | Role home dashboards such as `/admin`, `/customer`, `/partner`, `/vendor`, `/cashier` | Few stable posture metrics only |
| `module_cockpit` | `OperationsWorkspaceShell` / `ERPPageShell` | Parent module landing pages opened from the admin sidebar | Short readiness/status summary plus route cards |
| `register_list` | `RegistryPageShell` | Searchable, paginated entity ledgers and registers | Optional compact summary only |
| `transaction_form` | `TransactionPageShell` | Create, edit, collect, import, or wizard flows | Prefer inline derived totals over KPI walls |
| `detail_page` | `DetailPageShell` | `[id]`, `[caseId]`, `[slug]` drill-downs | Record-level chips only |
| `setup_checklist` | `SetupChecklistPageShell` | Business setup and accounting setup checklists | Completion/blocker counts only |
| `approval_queue` | `ApprovalQueuePageShell` | Items requiring approve/reject/review decisions | Pending/overdue queue counts allowed |
| `cashier_workflow` | `CashierWorkflowShell` | Counter collection, receipts, and day-close flows | Session totals and queue depth only |
| `accounting_control` | `AccountingControlShell` | COA, journals, books, reconciliation, GST, reports | Balances, locks, blockers allowed |
| `report_analytics` | `ReportPageShell` | BI, exports, charts, statements | Dense metrics allowed |
| `customer_self_service` | `SelfServicePageShell` | Customer-owned subscriptions, payments, deliveries, support | Personal posture only |
| `partner_vendor_workspace` | `PartnerVendorWorkspaceShell` | Partner/vendor scoped operations | Scoped totals only |
| `public_marketing` | `PublicMarketingShell` | Public marketing and trust pages | Non-financial marketing proof only |
| `auth_flow` | none | Login, register, reset, logout | No business KPIs |
| `system_utility` | none | Unauthorized, redirect, narrow utility screens | No KPIs |

## module_cockpit

### Purpose

A module cockpit is the parent page for a major admin ERP module. It answers: “What work belongs to this business area, and where should the operator go next?”

### When to use

Use for parent admin modules opened from the sidebar:

```text
/admin/sales
/admin/subscriptions
/admin/rent-lease
/admin/billing/direct-sale
/admin/accounting
/admin/inventory
/admin/manufacturing
/admin/crm
/admin/hr
/admin/service-desk
/admin/deliveries
/admin/reports
/admin/settings
```

### Required structure

Each cockpit should include:

```text
short business description
readiness/status summary where available
grouped workflow cards
real links only
deferred badge when a workflow is not implemented
breadcrumbs back to Admin
quick actions only for already implemented workflows
```

### Anti-patterns

Do not create fake workflow pages just to satisfy navigation.

Do not put child route explosions back into the sidebar.

Do not hide money-moving actions inside report pages.

Do not bypass setup/readiness gates for convenience.

## register_list

Searchable entity ledgers such as customers, payments, products, invoices, receipts, tickets, batches, and EMIs. These pages may be linked from cockpit cards or command palette results. They should not be promoted as sidebar children unless they are the parent module itself.

## transaction_form

Create/edit/collect/import flows. Keep financial calculations explicit and backend-controlled. These routes remain reachable from parent cockpits, buttons, command palette, or filtered registers.

## detail_page

Single-record pages with timeline, documents, related records, and scoped actions. Detail pages must not appear in sidebar navigation.

## accounting_control

Accounting pages handle ledgers, journals, setup, reconciliation, GST, and reports. They must not be used as shortcuts to mutate EMI/payment/subscription truth outside approved services.

## cashier_workflow

Cashier pages remain simple and role-specific. The parent-only admin sidebar rule does not apply to cashier, customer, partner, or vendor sidebars except that they must remain role-safe and must not receive admin modules.

## Command/search discovery

Since the admin sidebar is parent-only, the command palette may expose child workflow entries for ADMIN users using the preserved admin route registry. This keeps deep routes discoverable without making the sidebar a route list.

## Documentation and inventory maintenance

After adding or moving pages, run locally:

```bash
cd frontend
npm run inventory:routes
npm run check:routes
```

`docs/operations/frontend-route-inventory.md` is generated inventory output and should be refreshed by the script before release.
