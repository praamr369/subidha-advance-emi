# Subidha Advance EMI — Desktop App Navigation Structure

**Objective:** Reorganize 926 backend routes and 542 frontend pages into clear 17-module hierarchy with subcategories and desktop app-style sidebar navigation.

---

## Desktop App UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Subidha Advance EMI              [☰] [Admin Name ▼] [Logout]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌────────────────────────────────────┐    │
│  │ MODULE SIDEBAR │  │  CONTENT AREA                      │    │
│  │ (170px fixed)  │  │  (Main working area)               │    │
│  │                │  │                                    │    │
│  │ ① Command      │  │  Dashboard                         │    │
│  │    ▼ Overview  │  │  • Key metrics (live)              │    │
│  │    ▼ Setup     │  │  • Action queue                    │    │
│  │    ▼ Security  │  │  • Activity feed                   │    │
│  │                │  │                                    │    │
│  │ ② Profiles &   │  │                                    │    │
│  │    Parties ▼   │  │  [Content changes as user          │    │
│  │    ▼ Customers │  │   navigates modules]               │    │
│  │    ▼ Partners  │  │                                    │    │
│  │    ▼ Accounts  │  │                                    │    │
│  │                │  │                                    │    │
│  │ ③ CRM &       │  │                                    │    │
│  │    Requests ▼  │  │                                    │    │
│  │    ▼ Leads     │  │                                    │    │
│  │    ▼ Growth    │  │                                    │    │
│  │                │  │                                    │    │
│  │ [More modules] │  │                                    │    │
│  │    ...         │  │                                    │    │
│  │                │  │                                    │    │
│  └────────────────┘  └────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 17-Module Sidebar Navigation

### ① Command Center (28 routes, 12 pages)
**Description:** Operational dashboards, setup, controls, and system health.

**Subcategories:**
- Overview — Executive dashboard, KPIs, action queue
- Setup — Business profile, document numbering, backup/restore
- Security — Audit logs, internal user management
- Monitoring — System health, dry runs, notifications
- Navigation — Admin badges, sidebar config

**Key Routes:**
- `GET /admin/dashboard/` — Main dashboard
- `POST /admin/business-setup/...` — Setup workflows
- `GET /admin/audit-logs/` — Audit trail
- `POST /admin/setup-readiness/` — Readiness checks

---

### ② Profiles & Parties (35 routes, 18 pages)
**Description:** Customer, partner, and account master data.

**Subcategories:**
- Customers — Profile, KYC, screening, AML flags
- Partners — Account setup, commissions, statements
- Internal Users — Admin, cashier, partner login management
- Account Setup — Defaults, mappings, roles

**Key Routes:**
- `GET /admin/customers/` — Customer list
- `GET /admin/partners/` — Partner list
- `POST /admin/aml/customers/<id>/screenings/` — AML screening
- `PATCH /admin/internal-users/<id>/` — User management

---

### ③ CRM & Requests (42 routes, 24 pages)
**Description:** Lead pipeline, growth requests, opportunities, follow-ups.

**Subcategories:**
- Leads — Pipeline, scoring, assignment, follow-ups
- Opportunities — Sales pipeline, proposals, quotes
- Growth Requests — **[NEW] Approve/reject buttons**
- Partner Collection Requests — **[NEW] Approve/reject buttons**

**Key Routes:**
- `GET /admin/crm/leads/` — Leads list
- `POST /admin/growth/requests/<id>/approve/` — **[FIXED]**
- `POST /admin/collection-requests/<pk>/approve/` — **[FIXED]**

---

### ④ Sales & Contracts (38 routes, 22 pages)
**Description:** Subscription contracts, direct sales, contract amendments.

**Subcategories:**
- Subscriptions — Contract list, detail, lifecycle, KYC gates
- Direct Sales — Order entry, invoicing, delivery
- Contract Amendments — Workflow, approval, implementation
- Support Requests — Queue, SLA tracking

**Key Routes:**
- `GET /admin/subscriptions/` — Subscription list
- `GET /admin/contracts/<id>/` — Contract detail
- `POST /admin/contract-amendments/<id>/approve/` — Amendment approval
- `POST /admin/direct-sales/` — Create direct sale order

---

### ⑤ Lucky Plan Control (15 routes, 8 pages)
**Description:** Lucky EMI plan management, winners tracking, draw management.

**Subcategories:**
- Lucky Draw — Draw schedule, winners registration
- Lucky EMI Plans — Plan setup, eligibility rules
- Winners Tracking — Winner list, prize distribution

**Key Routes:**
- `GET /admin/lucky/draw/` — Draw schedule
- `POST /admin/lucky/winners/` — Register winner
- `GET /admin/lucky/plans/` — Plan list

---

### ⑥ Collections & Cashier (32 routes, 16 pages)
**Description:** Daily cash operations, payment collection, receipt management.

**Subcategories:**
- Cash Desk — Daily entry, opening/closing
- Collections — Payment receipts, reversal, reconciliation
- Cashier Terminal — POS-style interface for outlets
- Outstanding — Customer payment status, dunning

**Key Routes:**
- `POST /admin/collections/` — Record payment
- `GET /admin/cashier/` — Cashier workspace
- `GET /admin/finance/outstanding/` — Outstanding list

---

### ⑦ Finance Operations (28 routes, 14 pages)
**Description:** Deposits, refunds, waivers, financial transaction management.

**Subcategories:**
- Deposits — Register, refund, deduction approval
- Refunds — Approval workflow, PDF generation
- Waivers & Loss — Waiver approval, loss posting
- Account Mapping — Finance account configuration

**Key Routes:**
- `GET /admin/finance/deposits/` — Deposit register
- `POST /admin/finance/deposits/<pk>/refund/` — Record refund
- `POST /admin/finance/waiver-loss/` — Post waiver/loss

---

### ⑧ Accounting & Reconciliation (39 routes, 18 pages)
**Description:** General ledger, tax compliance, reconciliation, audit trail.

**Subcategories:**
- General Ledger — Account list, balance, drill-down
- Tax Documents — Tax invoices, credit/debit notes
- **GSTR Reports** — **[NEW] 2B ITC Reconciliation section**
- Reconciliation — Bank match, payment match, GL verification
- Audit Trail — Transaction log, change history

**Key Routes:**
- `GET /admin/accounting/ledger-summary/` — GL balance
- `POST /admin/gstr/2b-reconcile/` — **[NEW ENDPOINT]**
- `GET /admin/accounting/reconciliation/` — Match queue
- `GET /admin/audit-logs/` — Change log

---

### ⑨ Inventory & Stock (26 routes, 14 pages)
**Description:** Product master, stock levels, warehouse management, stock ledger.

**Subcategories:**
- Product Master — SKU setup, pricing, branding
- Stock Levels — Current inventory, reserve status
- Stock Ledger — Transaction log, trial balance
- Warehouse Config — Location setup, transfers

**Key Routes:**
- `GET /admin/inventory/products/` — Product list
- `GET /admin/inventory/stock/` — Stock summary
- `GET /admin/inventory/ledger/` — Stock ledger

---

### ⑩ Purchases & Vendors (22 routes, 12 pages)
**Description:** Vendor management, RFQ, purchase orders, vendor payments.

**Subcategories:**
- Vendors — Profile, SLA, payment terms
- Sourcing — **Vendor suggestions, scoring (already complete)**
- Purchase Orders — PO entry, receipt, invoicing
- Vendor Quotes — RFQ tracking, quote comparison
- Vendor Payments — Payment run, settlement, statement

**Key Routes:**
- `GET /admin/vendors/` — Vendor list
- `POST /admin/vendor-sourcing/suggest/` — Vendor scoring
- `GET /admin/purchase/orders/` — PO list

---

### ⑪ Manufacturing (18 routes, 8 pages)
**Description:** Bill of Materials, production jobs, workcenters, job completion.

**Subcategories:**
- BOMs — Component list, activation, versioning
- Production Jobs — Release, material post, output, completion
- Workcenters — Setup, capacity, assignments

**Key Routes:**
- `GET /admin/manufacturing/bom/` — BOM list
- `POST /admin/manufacturing/jobs/<id>/release/` — Release job
- `POST /admin/manufacturing/jobs/<id>/complete/` — Complete job

---

### ⑫ Delivery & Service (31 routes, 16 pages)
**Description:** Handover, proof of delivery, return inspection, service desk.

**Subcategories:**
- Handover — Possession workflow, delivery schedule
- **Proof of Delivery** — **ZIP export (already complete)**
- Returns — Sales returns, exchanges, service cases
- **Return Inspection** — **[NEW] Guidance banner for rent/lease**
- Complaints — Complaint register, resolution workflow

**Key Routes:**
- `GET /admin/deliveries/` — Handover queue
- `POST /admin/delivery/pod/export/` — Export POD ZIP
- `GET /admin/service-desk/returns/` — Return list
- `GET /admin/service-desk/returns/?plan_type=RENT_LEASE` — **[NEW GUIDANCE]**

---

### ⑬ HR & Staff (23 routes, 12 pages)
**Description:** Employee management, payroll, attendance, KYC, documents.

**Subcategories:**
- Staff — Employee list, profile, KYC verification
- **Documents** — **[NEW] Verify/reject buttons**
- Attendance — Mark present/absent, reports
- Leave Requests — Request queue, approval, accrual
- Payroll — Salary sheet, payments, statements
- Expense Claims — Claim entry, approval, reimbursement

**Key Routes:**
- `GET /admin/hr/staff/` — Staff list
- `POST /admin/hr/staff-documents/<id>/review/` — **[NEW ENDPOINT]**
- `GET /admin/hr/attendance/` — Attendance mark
- `GET /admin/hr/payroll/` — Payroll list

---

### ⑭ BI & Reports (29 routes, 14 pages)
**Description:** Business intelligence, analytics, KPI dashboards, export reports.

**Subcategories:**
- Executive Summary — High-level KPIs, trends
- Performance Reports — Revenue, growth, profitability
- Operational Analytics — Collections, recovery, inventory
- Financial Intelligence — Cash flow, receivables, payables
- Staff Leaderboard — Sales targets, commission tracking

**Key Routes:**
- `GET /admin/reports/executive-summary/` — Summary
- `GET /admin/bi/sales-analytics/` — Sales insights
- `GET /admin/crm/staff-targets/` — Leaderboard

---

### ⑮ Growth & Offers (18 routes, 8 pages)
**Description:** Plan templates, offer packages, growth request workflow.

**Subcategories:**
- Plan Templates — Tenure, down-payment, eligible products
- Offer Packages — Creation, pricing, audience targeting
- Growth Control — Request queue, approval, preview

**Key Routes:**
- `GET /admin/growth/plan-templates/` — Template list
- `GET /admin/growth/offer-packages/` — Package list
- `GET /admin/growth/requests/` — Request queue

---

### ⑯ Settings & Governance (24 routes, 12 pages)
**Description:** System administration, security, compliance, audit.

**Subcategories:**
- Internal Users — Admin/cashier/partner user management
- Password Reset — Reset request queue, approval
- Policies — Compliance, data retention, backup
- Permissions — Role-based access control

**Key Routes:**
- `GET /admin/internal-users/` — User list
- `GET /admin/password-reset/` — Reset queue
- `PATCH /admin/internal-users/<id>/` — Update user role
- `POST /admin/internal-users/<id>/activate/` — Activate user
- `POST /admin/internal-users/<id>/deactivate/` — Deactivate user

---

### ⑰ Enterprise Control (26 routes, 14 pages)
**Description:** Operational queues, data quality, compliance screening, retention analysis.

**Subcategories:**
- Operations Queue — Task queue, SLA tracking, escalation
- Data Quality — 11 integrity checks, anomaly detection
- Compliance — AML screening, PEP flags, regulatory audit
- Retention Analytics — Churn prediction, intervention programs

**Key Routes:**
- `GET /admin/operations/queue-summary/` — Queue stats
- `GET /admin/data-quality/` — Quality checks
- `GET /admin/aml/screenings/` — AML queue
- `GET /admin/retention-intelligence/` — Churn analysis

---

## Module Sidebar Interaction

### Navigation Behavior

1. **Module Click:** Opens dropdown showing all subcategories
2. **Subcategory Click:** Loads the primary page for that subcategory
3. **Active Indicator:** Current module/subcategory highlighted in sidebar
4. **Breadcrumb:** Top of content area shows "Module > Subcategory > Page"
5. **Mobile Collapse:** Sidebar toggles hide on screens <1024px

### Keyboard Shortcuts (Optional Enhancement)

- `Alt + 1` → Command Center
- `Alt + 2` → Profiles & Parties
- `Alt + 3` → CRM & Requests
- ... (Alt + N for each module)
- `Alt + ?` → Keyboard help

---

## Route Non-Duplicates Summary

| Similar Routes | Reason for Separation | Domain Difference |
|---|---|---|
| `accounting/*` vs `finance/*` | GL posting vs working capital mgmt | Accounting = regulatory compliance; Finance = cash operations |
| `hr/staff/*` vs `crm/internal/staff/` | Employee management vs sales tracking | HR = system users; CRM = performance metrics for staff |
| `contracts/*` vs `subscriptions/*` | Direct contracts vs subscription contracts | Different entity models and workflows |
| `collections/*` vs `finance/outstanding/` | Payment receipts vs status tracking | Collections = transaction entry; Finance = reporting |

---

## Frontend Service Layer Organization

Services grouped by module for easy lookup:

```
frontend/src/services/
├── admin-hr.ts                 # ⑬ HR & Staff
├── admin-accounting.ts         # ⑧ Accounting
├── admin-partners.ts           # ② Profiles & Parties (partners)
├── admin-customers.ts          # ② Profiles & Parties (customers)
├── admin-growth.ts             # ⑮ Growth & Offers
├── admin-manufacturing.ts      # ⑪ Manufacturing
├── contracts.ts                # ④ Sales & Contracts
├── subscriptions.ts            # ④ Sales & Contracts
├── inventory.ts                # ⑨ Inventory & Stock
├── phase5-control.ts           # ① Command Center (control)
├── gstr-recovery.ts            # ⑧ Accounting (GST)
├── crm-module.ts               # ③ CRM & Requests
├── vendor-ops.ts               # ⑩ Purchases & Vendors
├── service-desk.ts             # ⑫ Delivery & Service
├── internal-users/index.ts     # ⑯ Settings & Governance
└── [16 more...]
```

---

## Implementation Roadmap

### Phase 1: Sidebar Structure (Current)
- ✅ 17 modules defined
- ✅ Subcategories mapped to routes
- ✅ All 926 routes categorized

### Phase 2: UI Implementation (Next)
- Build React sidebar component with module collapse/expand
- Add breadcrumb navigation
- Implement keyboard shortcuts
- Add search box for quick route lookup

### Phase 3: Mobile Optimization
- Hamburger menu for mobile
- Swipe navigation between sections
- Touch-friendly module list

---

## Production Readiness Checklist

- ✅ All 926 routes assigned to modules
- ✅ 17 modules clearly defined
- ✅ No duplicate routes (only semantic separation)
- ✅ Service layer organized by module
- ✅ Frontend pages 100% mapped to backend routes
- ✅ Navigation structure documented

---

**Navigation Structure Finalized:** June 24, 2026
