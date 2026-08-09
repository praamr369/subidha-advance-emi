# Subidha Advance EMI — Desktop App Navigation UI

**Objective:** Desktop-style admin interface with fixed sidebar (170px), dropdown module navigation, and breadcrumb trails.

---

## Full-Screen Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Subidha Advance EMI      [☰] [Search...] [🔔 Notifications] [👤 Admin ▼] │ HEADER BAR
├─────────┬──────────────────────────────────────────────────────────────────┤
│         │                                                                  │
│ SIDEBAR │                    CONTENT AREA                                 │
│ (170px) │                  (Responsive)                                   │
│         │                                                                  │
│ ① Cmd   │ Dashboard                                                      │
│  Center │ ┌──────────────────────────────────────────────────────┐       │
│ ▼       │ │ • Command Center Home                               │       │
│         │ │ • KPIs: Active subscriptions, collections, revenue  │       │
│ ② Prof- │ │ • Action queue: 12 pending approvals               │       │
│    iles │ │ • Activity feed: Recent changes, audit trail        │       │
│ ▼       │ │                                                      │       │
│         │ └──────────────────────────────────────────────────────┘       │
│ ③ CRM   │                                                                  │
│ ▼       │ Breadcrumb: Command Center > Dashboard                          │
│         │                                                                  │
│ ④ Sales │                                                                  │
│ ▼       │                                                                  │
│ ⋮       │                                                                  │
│         │                                                                  │
└─────────┴──────────────────────────────────────────────────────────────────┘
```

---

## Header Bar (Top Navigation)

```
┌────────────────────────────────────────────────────────────────────────┐
│ [☰] Subidha Advance EMI        [🔍 Search...] [🔔] [⚙️] [👤 Admin ▼] │
└────────────────────────────────────────────────────────────────────────┘
│ Item                    Keyboard │ Action
├─────────────────────────────────┤──────────────────────────────────────
│ ☰ (Hamburger)          (Mobile) │ Toggle sidebar on screens <1024px
│ Logo                             │ Click → go to Dashboard
│ [🔍 Search...]         (Ctrl+K) │ Quick command palette (routes + actions)
│ [🔔] Notifications     (Alt+N)  │ Show pending actions, alerts
│ [⚙️] Settings          (Alt+S)  │ Admin settings, preferences
│ [👤 Admin ▼]           (Alt+U)  │ Dropdown: Profile, Logout, Preferences
└────────────────────────────────────────────────────────────────────────┘
```

---

## Sidebar (Fixed 170px)

### Structure

```
┌─────────────────────┐
│   SIDEBAR (170px)   │
├─────────────────────┤
│ ① Command Center ▼  │  ← Click to expand/collapse
│    ├─ Overview      │  ← Subcategory link
│    ├─ Setup         │
│    ├─ Security      │
│    └─ Monitoring    │
│                     │
│ ② Profiles & ▼      │  ← Expanded (blue highlight)
│    Parties          │
│    ├─ Customers     │  ← Current page (bold)
│    ├─ Partners      │
│    └─ Internal      │
│      Users          │
│                     │
│ ③ CRM & ▼           │  ← Collapsed (gray arrow)
│    Requests         │
│                     │
│ ④ Sales &           │  ← Collapsed
│    Contracts ▼      │
│                     │
│ ⋮ [13 more mods]    │
│                     │
│ [Settings]          │  ← Fixed at bottom
│ [Help]              │
│ [Logout]            │
└─────────────────────┘
```

---

## Complete 17-Module Sidebar Navigation

```
┌──────────────────────┐
│  SIDEBAR STRUCTURE   │
└──────────────────────┘

① COMMAND CENTER (28 routes, 12 pages)
   [Status: All systems operational]
   ├─ Overview          → GET /admin/dashboard/
   ├─ Setup             → GET /admin/business-setup/
   ├─ Security          → GET /admin/audit-logs/
   ├─ Monitoring        → GET /admin/setup-readiness/
   └─ Navigation        → Admin badges, sidebar config

② PROFILES & PARTIES (35 routes, 18 pages)
   [Status: 2,340 customers, 180 partners]
   ├─ Customers         → GET /admin/customers/
   ├─ Partners          → GET /admin/partners/
   ├─ Internal Users    → GET /admin/internal-users/
   └─ Account Setup     → GET /admin/profile/defaults/

③ CRM & REQUESTS (42 routes, 24 pages)
   [Status: 156 open opportunities]
   ├─ Leads             → GET /admin/crm/leads/
   ├─ Opportunities     → GET /admin/crm/opportunities/
   ├─ Growth Requests   → GET /admin/growth/requests/  ✓ [NEW: Approve/Reject]
   └─ Partner Payments  → GET /admin/collection-requests/  ✓ [NEW: Approve/Reject]

④ SALES & CONTRACTS (38 routes, 22 pages)
   [Status: 4,821 active subscriptions]
   ├─ Subscriptions     → GET /admin/subscriptions/
   ├─ Direct Sales      → GET /admin/direct-sales/
   ├─ Amendments        → GET /admin/contract-amendments/
   └─ Support           → GET /admin/support-requests/

⑤ LUCKY PLAN CONTROL (15 routes, 8 pages)
   [Status: Lucky plan active, 42 winners this quarter]
   ├─ Lucky Draw        → GET /admin/lucky/draw/
   ├─ Lucky EMI Plans   → GET /admin/lucky/plans/
   └─ Winners Tracking  → GET /admin/lucky/winners/

⑥ COLLECTIONS & CASHIER (32 routes, 16 pages)
   [Status: Today ₹82,400 collected]
   ├─ Cash Desk         → POST /admin/collections/
   ├─ Receipts          → GET /admin/collections/
   ├─ Cashier Terminal  → GET /admin/cashier/
   └─ Outstanding       → GET /admin/finance/outstanding/

⑦ FINANCE OPERATIONS (28 routes, 14 pages)
   [Status: ₹1.2M pending refunds]
   ├─ Deposits          → GET /admin/finance/deposits/
   ├─ Refunds           → POST /admin/finance/deposits/<pk>/refund/
   ├─ Waivers & Loss    → POST /admin/finance/waiver-loss/
   └─ Account Mapping   → GET /admin/finance/mapping/

⑧ ACCOUNTING & RECONCILIATION (39 routes, 18 pages)
   [Status: GL balanced, 3 pending reconciliations]
   ├─ General Ledger    → GET /admin/accounting/ledger-summary/
   ├─ Tax Documents     → GET /admin/accounting/tax-invoices/
   ├─ GSTR Reports      → GET /admin/reports/gstr/  ✓ [NEW: 2B Reconciliation]
   ├─ Reconciliation    → GET /admin/accounting/reconciliation/
   └─ Audit Trail       → GET /admin/audit-logs/

⑨ INVENTORY & STOCK (26 routes, 14 pages)
   [Status: 1,240 units in warehouse]
   ├─ Product Master    → GET /admin/inventory/products/
   ├─ Stock Levels      → GET /admin/inventory/stock/
   ├─ Stock Ledger      → GET /admin/inventory/ledger/
   └─ Warehouse         → GET /admin/inventory/warehouse/

⑩ PURCHASES & VENDORS (22 routes, 12 pages)
   [Status: 14 active vendors, 8 pending POs]
   ├─ Vendors           → GET /admin/vendors/
   ├─ Sourcing          → GET /admin/vendor-sourcing/suggest/
   ├─ Purchase Orders   → GET /admin/purchase/orders/
   ├─ Vendor Quotes     → GET /admin/purchase/quotes/
   └─ Vendor Payments   → GET /admin/purchase/payments/

⑪ MANUFACTURING (18 routes, 8 pages)
   [Status: 12 jobs in production]
   ├─ BOMs              → GET /admin/manufacturing/bom/
   ├─ Production Jobs   → GET /admin/manufacturing/jobs/
   └─ Workcenters       → GET /admin/manufacturing/workcenters/

⑫ DELIVERY & SERVICE (31 routes, 16 pages)
   [Status: 23 deliveries today]
   ├─ Handover          → GET /admin/deliveries/
   ├─ Proof of Delivery → GET /admin/delivery/pod/  ✓ [Export ZIP]
   ├─ Returns           → GET /admin/service-desk/returns/  ✓ [NEW: Inspection Guidance]
   └─ Complaints        → GET /admin/service-desk/complaints/

⑬ HR & STAFF (23 routes, 12 pages)
   [Status: 85 employees, 8 pending KYC]
   ├─ Staff             → GET /admin/hr/staff/
   ├─ Documents         → GET /admin/hr/staff-documents/  ✓ [NEW: Verify/Reject]
   ├─ Attendance        → GET /admin/hr/attendance/
   ├─ Leave Requests    → GET /admin/hr/leave-requests/
   ├─ Payroll           → GET /admin/hr/payroll/
   └─ Expense Claims    → GET /admin/hr/expense-claims/

⑭ BI & REPORTS (29 routes, 14 pages)
   [Status: Last updated 2 hours ago]
   ├─ Executive Summary → GET /admin/reports/executive-summary/
   ├─ Performance       → GET /admin/bi/sales-analytics/
   ├─ Operational       → GET /admin/reports/operational/
   ├─ Financial         → GET /admin/reports/financial/
   └─ Staff Leaderboard → GET /admin/crm/staff-targets/

⑮ GROWTH & OFFERS (18 routes, 8 pages)
   [Status: 7 active offer packages]
   ├─ Plan Templates    → GET /admin/growth/plan-templates/
   ├─ Offer Packages    → GET /admin/growth/offer-packages/
   └─ Growth Control    → GET /admin/growth/requests/

⑯ SETTINGS & GOVERNANCE (24 routes, 12 pages)
   [Status: 12 admin users, 8 roles]
   ├─ Internal Users    → GET /admin/internal-users/
   ├─ Password Reset    → GET /admin/password-reset/
   ├─ Policies          → GET /admin/policies/
   └─ Permissions       → GET /admin/permissions/

⑰ ENTERPRISE CONTROL (26 routes, 14 pages)
   [Status: 8 queued tasks, zero data quality alerts]
   ├─ Operations Queue  → GET /admin/operations/queue-summary/
   ├─ Data Quality      → GET /admin/data-quality/
   ├─ Compliance        → GET /admin/aml/screenings/
   └─ Retention         → GET /admin/retention-intelligence/

[FOOTER - Fixed Bottom]
├─ ⚙️  Settings        → /admin/settings/profile
├─ ❓ Help & Docs     → /docs/
└─ 🚪 Logout          → /auth/logout/

```

---

## Navigation Interactions

### Module Expand/Collapse

```
1. CLICK MODULE NAME
   ① Command Center ▼    (expanded, blue highlight)
   ├─ Overview
   ├─ Setup
   ├─ Security
   └─ Monitoring

2. CLICK AGAIN
   ① Command Center ▶    (collapsed, no subcategories visible)

3. CLICK SUBCATEGORY
   ① Command Center ▼
   ├─ Overview          ← click here
   ├─ Setup
   └─ ...
   
   → Page loads, breadcrumb shows:
   "Command Center > Overview"
   
   → This subcategory highlighted in bold
```

### Breadcrumb Navigation

```
Top of content area:

Command Center > Setup > Business Profile

[Clickable]:
- Click "Command Center" → Back to module overview
- Click "Setup" → Back to setup list
- "Business Profile" → Current page (not clickable)

Keyboard: Alt+← (back), Alt+→ (forward)
```

---

## Keyboard Shortcuts (Optional Enhancement)

```
Module Quick Access:
  Alt+1   → Command Center
  Alt+2   → Profiles & Parties
  Alt+3   → CRM & Requests
  Alt+4   → Sales & Contracts
  Alt+5   → Lucky Plan Control
  Alt+6   → Collections & Cashier
  Alt+7   → Finance Operations
  Alt+8   → Accounting & Reconciliation
  Alt+9   → Inventory & Stock
  Alt+0   → Purchases & Vendors
  Alt+Q   → Manufacturing
  Alt+W   → Delivery & Service
  Alt+E   → HR & Staff
  Alt+R   → BI & Reports
  Alt+T   → Growth & Offers
  Alt+Y   → Settings & Governance
  Alt+U   → Enterprise Control

Navigation:
  Ctrl+K  → Command palette (search routes, actions)
  Alt+←   → Back
  Alt+→   → Forward
  Alt+H   → Help
  Alt+?   → Keyboard shortcuts
  Alt+/   → Toggle sidebar
```

---

## Responsive Behavior

### Desktop (1440px+)
```
[SIDEBAR 170px FIXED] [CONTENT area 100% - 170px]
Sidebar always visible, never hides
```

### Tablet (768px - 1440px)
```
[☰ TOGGLE] [CONTENT area 100%]
Click hamburger to show/hide sidebar
Sidebar slides over content when open (overlay)
```

### Mobile (<768px)
```
[☰] [CONTENT AREA 100%]
Sidebar is overlay, swipe right to open
Breadcrumb and quick links prominent
```

---

## Why This Architecture Works

### 1. **17 Modules = Semantic Clarity**
   - Each module corresponds to ONE business domain
   - Admin instantly knows where to go
   - No route confusion (no `admin/accounting/staff` AND `admin/hr/staff` on same level)

### 2. **Subcategories = Task Efficiency**
   - Each module shows 2-6 subcategories
   - Admin doesn't need to hunt for related pages
   - One-click navigation to most-used sections

### 3. **Fixed Sidebar = Consistent Context**
   - Admin always knows current module
   - Context switches are explicit
   - Breadcrumb shows path (Command Center > Setup > Business Profile)

### 4. **Desktop App Pattern = Familiar UX**
   - Users expect sidebar (like VS Code, Slack, Chrome)
   - Top bar for global actions (search, notifications, user menu)
   - Keyboard shortcuts make power users faster

### 5. **No Route Duplicates**
   - `hr/staff/*` = Employee management (HR domain)
   - `crm/staff-targets/*` = Sales performance (CRM domain)
   - `reports/staff-ledger/*` = Financial reporting (Accounting domain)
   - Kept separate by design, not by mistake

---

## Example Navigation Flows

### Flow 1: Approve Growth Requests
```
User: "I need to approve pending growth requests"

Step 1: Click "③ CRM & Requests" in sidebar
Step 2: Subcategories appear (expanded)
Step 3: Click "Growth Requests" subcategory
Step 4: Browser loads /admin/growth/requests/
Step 5: Breadcrumb shows: CRM & Requests > Growth Requests
Step 6: Admin sees list of SUBMITTED/UNDER_REVIEW requests
Step 7: Click "Approve" button on request
Step 8: Modal appears with reason field
Step 9: Submit → request status = APPROVED, audit note appended
```

### Flow 2: Create New Employee (HR Staff)
```
User: "I need to onboard a new employee"

Step 1: Click "⑬ HR & Staff" in sidebar
Step 2: Subcategories appear
Step 3: Click "Staff" subcategory
Step 4: Browser loads /admin/hr/staff/
Step 5: Breadcrumb shows: HR & Staff > Staff
Step 6: Admin sees employee list with "+ Add" button
Step 7: Click "+ Add Staff"
Step 8: Form opens: Name, Email, Designation, Department
Step 9: Submit → employee created, status = ACTIVE, assigned to payroll
Step 10: System generates default password, sends via email
```

### Flow 3: Sales Performance Check (NOT HR Staff)
```
User: "Show me which sales staff are hitting targets"

Step 1: Click "⑭ BI & Reports" in sidebar
Step 2: Click "Staff Leaderboard" subcategory
Step 3: Browser loads /admin/crm/staff-targets/  ← Different route!
Step 4: Breadcrumb shows: BI & Reports > Staff Leaderboard
Step 5: Admin sees sales staff ranked by commission, revenue
Step 6: This uses CRM staff performance data, NOT HR employee data

Key difference from Flow 2:
- Flow 2: HR > Staff           = Employee management
- Flow 3: BI > Staff Leaderboard = Sales performance (CRM)
```

---

## Implementation Checklist

### Phase 1: Sidebar UI Component (React)
- [ ] Create `<Sidebar />` component with 17 modules
- [ ] Implement expand/collapse toggle
- [ ] Add current page highlighting
- [ ] Responsive mobile toggle
- [ ] Persist expanded/collapsed state in localStorage

### Phase 2: Breadcrumb Navigation
- [ ] Create `<Breadcrumb />` component
- [ ] Extract path from current route
- [ ] Make each segment clickable (navigate up)
- [ ] Show full path in mobile view

### Phase 3: Keyboard Shortcuts
- [ ] Implement Alt+1–9 module shortcuts
- [ ] Add Ctrl+K command palette
- [ ] Document all shortcuts in help modal

### Phase 4: Search & Command Palette
- [ ] Create searchable route index
- [ ] Implement fuzzy search (Cmd Palette style)
- [ ] Show matching routes + descriptions
- [ ] Navigate on Enter

### Phase 5: Mobile Optimization
- [ ] Hamburger menu toggle
- [ ] Sidebar slide-in/slide-out animation
- [ ] Touch-friendly tap targets (44px minimum)
- [ ] Breadcrumb ellipsis on narrow screens

---

## Success Metrics

✓ **Discoverability:** Admin finds any feature in ≤3 clicks  
✓ **Route Clarity:** No confusion between `hr/staff/*` and `crm/staff-targets/*`  
✓ **Speed:** Power users use keyboard shortcuts (Alt+4 → Contracts in <1s)  
✓ **Mobile:** Sidebar works on 320px phone screens  
✓ **Accessibility:** Keyboard navigation only (no mouse required)  

---

**Desktop Navigation UI Finalized:** June 24, 2026
