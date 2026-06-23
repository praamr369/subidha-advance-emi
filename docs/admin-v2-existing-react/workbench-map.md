# Admin Workbench Map

| Workbench | Route | Current route families |
|---|---|---|
| Command Center | `/admin` | dashboard, control, operations, analytics, BI, global search, AI, ERP, notifications |
| Customer 360 | `/admin/customer-360` | customers, profiles, KYC, advances, support, timeline |
| Revenue | `/admin/revenue` | sales, direct sale, Lucky Plan, subscriptions, rent/lease, EMIs, payments, billing, settlements |
| Inventory & Fulfillment | `/admin/inventory-fulfillment` | products, stock, purchases, vendors, manufacturing, deliveries, returns, service, brochures |
| Finance Control | `/admin/finance-control` | finance, collections review, liabilities, commissions, payouts, reversals, reconciliation, accounting, audit |
| CRM & Partners | `/admin/crm-partners` | leads, enquiries, follow-ups, KYC, partners, offers, plan templates, retention |
| Operations & People | `/admin/operations-people` | daily work, branches, staff, attendance, leave, payroll, requests, amendments, notifications |
| Reports & Setup | `/admin/reports-setup` | reports, users, roles, business setup, finance setup, numbering, imports, readiness, audit |

## Phase 1 behavior

- the sidebar exposes only the eight workbenches
- workbench tabs use `?tab=...`
- each tab links to the current live module route
- old routes are not deleted or redirected
- the canonical route registry remains available for route auditing and
  command-palette discovery

## Migration rule

Move live content into a workbench only after:

1. the backend contract is confirmed
2. loading, empty, error, and success states exist
3. role and permission behavior matches the current route
4. financial, stock, and audit controls remain backend-owned
5. smoke validation passes
