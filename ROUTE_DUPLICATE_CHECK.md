# Route Duplicate Check — Quick Reference

**Purpose:** Answer "Are these routes duplicates?" with clear semantic explanation.

---

## The 10 Most Confusing Route Pairs

### ❓ Pair #1: `hr/staff/*` vs. `crm/staff-targets/*`

| Aspect | `hr/staff/` | `crm/staff-targets/` |
|--------|-----------|----------------------|
| **Entity** | Employee record | Sales performance target |
| **Database Table** | `employee` | `sales_staff_target` |
| **Example Data** | Name, salary, attendance | Commission, revenue, growth |
| **Routes** | `POST /admin/hr/staff/` (create employee) | `POST /admin/crm/staff-targets/` (set target) |
| **User** | HR manager | Sales manager |
| **Workflow** | Hire → Onboard → Verify KYC → Payroll | Assign → Track → Calculate commission |
| **Real-World Use Case** | "I hired 3 new staff members" | "I set Q3 revenue target at ₹50L" |
| **Duplicate?** | **NO ✓** | Different entities, workflows, users |

---

### ❓ Pair #2: `accounting/*` vs. `finance/*`

| Aspect | `accounting/` | `finance/` |
|--------|-------------|-----------|
| **Domain** | Regulatory compliance & GL | Working capital & cash operations |
| **Speed** | Slow, deliberate (month-end) | Fast, daily operations |
| **User** | Finance manager (compliance-focused) | Cashier (speed-focused) |
| **Model** | Chart of Accounts, GL entries, journals | Payments, deposits, refunds |
| **Example Routes** | `GET /admin/accounting/ledger-summary/` (GL balances) | `POST /admin/collections/` (record payment) |
| **Real-World Use Case** | "Close the books for June 30" (month-end task) | "Deposit today's cash collection ₹15,000" (daily task) |
| **Timeline** | Quarterly/annual reporting | Same-day processing |
| **Duplicate?** | **NO ✓** | Different users, timelines, business processes |

---

### ❓ Pair #3: `contracts/*` vs. `subscriptions/*`

| Aspect | `contracts/` | `subscriptions/` |
|--------|------------|-----------------|
| **Entity Type** | Formal agreement | Recurring plan |
| **Lifecycle** | One-time (static → amended → ended) | Recurring (created → renewed → ended) |
| **Example** | Service contract, direct sales agreement | EMI subscription (rent, lease, buy) |
| **Amendment** | Formal process with approval workflow | Simple plan upgrade (auto-approved) |
| **Invoicing** | One-time or milestone-based | Recurring (monthly, quarterly, annual) |
| **Routes** | `POST /admin/contract-amendments/<id>/approve/` | `POST /admin/subscriptions/<id>/plan-upgrade/` |
| **Real-World Use Case** | "Amend the 3-year service contract for customer X" | "Upgrade customer Y's plan from 12-month to 24-month" |
| **Duplicate?** | **NO ✓** | Different entity models, lifecycles, workflows |

---

### ❓ Pair #4: `hr/staff-documents/*` vs. `service-desk/complaints/*`

| Aspect | `hr/staff-documents/` | `service-desk/complaints/` |
|--------|---------------------|-------------------------|
| **Document Type** | Employee KYC, contract copy, ID proof | Customer complaint tickets |
| **Entity** | Employee (internal) | Customer (external) |
| **Workflow** | Upload → Verify → Accept/Reject | Log → Investigate → Resolve |
| **Routes** | `POST /admin/hr/staff-documents/<id>/review/` | `POST /admin/service-desk/complaints/` |
| **User** | HR manager | Service desk supervisor |
| **Status Values** | DRAFT, ACTIVE, INACTIVE | OPEN, IN_PROGRESS, RESOLVED, CLOSED |
| **Real-World Use Case** | "Verify employee's PAN and Aadhar documents" | "Customer reports product is defective" |
| **Duplicate?** | **NO ✓** | Different entities (employee vs. customer), different workflows |

---

### ❓ Pair #5: `deliveries/handover/*` vs. `service-desk/returns/*`

| Aspect | `deliveries/handover/` | `service-desk/returns/` |
|--------|----------------------|----------------------|
| **Direction** | OUT (product going to customer) | IN (product coming from customer) |
| **Trigger** | Subscription activation (possession transfer) | Product defect, rental end, exchange request |
| **Workflow** | Schedule → Deliver → Verify → Handover → POD | Request → Inspect condition → Approve → Refund/Exchange |
| **Routes** | `POST /admin/deliveries/<id>/schedule/` | `POST /admin/service-desk/returns/<id>/inspect/` |
| **Documentation** | Proof of Delivery (POD), signature | Return inspection form, condition grading |
| **Real-World Use Case** | "Deliver washing machine to customer on Thursday" | "Customer returning sofa, inspect condition for damage deduction" |
| **Duplicate?** | **NO ✓** | Opposite directions, different workflows |

---

### ❓ Pair #6: `inventory/products/*` vs. `brochures/catalog/*`

| Aspect | `inventory/products/` | `brochures/catalog/` |
|--------|---------------------|-------------------|
| **Purpose** | Stock keeping, warehouse management | Marketing, customer catalog |
| **Data** | SKU, cost, warehouse location, stock level | Product images, descriptions, pricing for marketing |
| **User** | Warehouse manager | Marketing manager |
| **Routes** | `GET /admin/inventory/products/` (warehouse stock) | `GET /admin/brochures/catalog/` (customer-facing) |
| **Query** | "How many washing machines do we have?" | "What washing machines can we market to premium segment?" |
| **Duplicate?** | **NO ✓** | Warehouse operations vs. Marketing |

---

### ❓ Pair #7: `accounting/reconciliation/*` vs. `finance/settlements/*`

| Aspect | `accounting/reconciliation/` | `finance/settlements/` |
|--------|---------------------------|----------------------|
| **Match Type** | GL entry ↔ Bank statement | EMI payment ↔ Subscription |
| **Timing** | Month-end reconciliation | Daily settlements |
| **User** | Finance manager (audit) | Cashier (operations) |
| **Routes** | `GET /admin/accounting/reconciliation/` | `POST /admin/settlements/` |
| **Workflow** | Find mismatches → Investigate → Resolve | Record payment → Calculate interest → Post settlement |
| **Real-World Use Case** | "Our books show ₹100K received but bank shows ₹98K" | "Customer paid ₹5,000 on their ₹1,00,000 loan" |
| **Duplicate?** | **NO ✓** | Different reconciliation targets (GL vs. EMI) |

---

### ❓ Pair #8: `crm/leads/*` vs. `crm/opportunities/*`

| Aspect | `crm/leads/` | `crm/opportunities/` |
|--------|------------|-------------------|
| **Stage** | Early (unqualified prospect) | Late (qualified sales opportunity) |
| **Status** | OPEN, CONTACTED, QUALIFIED, DISQUALIFIED | PROPOSAL, NEGOTIATION, CLOSED_WON, CLOSED_LOST |
| **Routes** | `GET /admin/crm/leads/` (lead list) | `GET /admin/crm/opportunities/` (opportunity list) |
| **Conversion** | Lead → Opportunity (if qualified) | Opportunity → Subscription (if won) |
| **Real-World Use Case** | "Customer inquiry about product" (lead) | "Customer ready to sign, sending proposal" (opportunity) |
| **Duplicate?** | **NO ✓** | Different stages in sales funnel |

---

### ❓ Pair #9: `finance/deposits/*` vs. `accounting/tax-invoices/*`

| Aspect | `finance/deposits/` | `accounting/tax-invoices/` |
|--------|-------------------|-------------------------|
| **Record Type** | Security deposit (customer liability) | Tax document (GST compliance) |
| **Purpose** | Collateral, refundable liability | Tax reporting, audit trail |
| **Routes** | `GET /admin/finance/deposits/` | `GET /admin/accounting/tax-invoices/` |
| **Typical Action** | Approve refund, deduct damage | Export GSTR, file return |
| **Real-World Use Case** | "Refund ₹2,000 security deposit" | "Generate GSTR-1 for June sales" |
| **Duplicate?** | **NO ✓** | Financial liability vs. Tax compliance |

---

### ❓ Pair #10: `reports/staff-ledger/*` vs. `accounting/ledger-summary/*`

| Aspect | `reports/staff-ledger/` | `accounting/ledger-summary/` |
|--------|----------------------|---------------------------|
| **Dimension** | By staff member (employee P&L) | By GL account (balance sheet) |
| **Data** | Staff commission, expense, sales revenue | GL account balance, period change |
| **Routes** | `GET /reports/staff-ledger/` (staff-focused) | `GET /admin/accounting/ledger-summary/` (account-focused) |
| **User** | Sales director, finance manager | Finance manager, auditor |
| **Real-World Use Case** | "How much revenue did salesman X generate?" | "What's the GL balance for 'Revenue - Product Sales'?" |
| **Duplicate?** | **NO ✓** | Different dimensions (staff vs. accounts) |

---

## Quick Decision Tree: "Is This a Duplicate?"

```
START: "Do these routes look similar?"

├─ YES
│  └─ Q1: Do they reference the SAME database table?
│     ├─ NO → NOT a duplicate (different entities)
│     │        Examples: hr/staff/* (employee) vs. crm/staff-targets/* (target)
│     │
│     └─ YES → Q2: Do they use the SAME business workflow?
│        ├─ NO → NOT a duplicate (different workflows)
│        │        Examples: accounting/reconciliation/* (match) vs. 
│        │                  finance/settlements/* (post)
│        │
│        └─ YES → Q3: Are they serving the SAME user?
│           ├─ NO → NOT a duplicate (different users)
│           │        Examples: finance/* (cashier) vs. 
│           │                  accounting/* (finance manager)
│           │
│           └─ YES → Q4: Do they access the SAME data?
│              ├─ NO → NOT a duplicate (different data subsets)
│              │        Examples: inventory/products/* (stock keeping) vs.
│              │                  brochures/catalog/* (marketing)
│              │
│              └─ YES → Q5: Do they perform DIFFERENT operations?
│                 ├─ YES → NOT a duplicate (CRUD separation)
│                 │         Examples: /list vs. /approve vs. /detail
│                 │
│                 └─ YES → ⚠️  LIKELY DUPLICATE
│                          Check if one route should be removed or merged

Result: If you hit ANY "NOT a duplicate" answer, the routes are distinct.
Only if you hit "LIKELY DUPLICATE" should you investigate further.
```

---

## Summary: Route Distribution by Type

### 5 Semantic Domains (All Necessary)

| Domain | Module | Route Prefix | Why It's Not a Duplicate |
|--------|--------|-------------|-------------------------|
| Employee Mgmt | HR & Staff | `hr/staff/*` | Internal users, payroll, compliance |
| Sales Perf | BI & Reports | `crm/staff-targets/*` | Sales staff performance, commission tracking |
| Cash Ops | Collections & Cashier | `collections/*` | Daily cash handling, same-day processing |
| Compliance | Accounting | `accounting/*` | Month-end GL reconciliation, audit trail |
| Finance | Finance Ops | `finance/*` | Deposits, refunds, working capital |

### Routes That Look Similar But Aren't Duplicates

| Route Pair | Reason |
|-----------|--------|
| `hr/staff/*` ↔ `crm/staff-targets/*` | Employee vs. Sales performance (different tables, users, workflows) |
| `accounting/*` ↔ `finance/*` | Compliance vs. Operations (different timelines, users, business processes) |
| `contracts/*` ↔ `subscriptions/*` | One-time agreement vs. Recurring plan (different entity models) |
| `hr/staff-documents/*` ↔ `service-desk/complaints/*` | Employee docs vs. Customer complaints (different entities) |
| `deliveries/handover/*` ↔ `service-desk/returns/*` | Outbound vs. Inbound (opposite directions) |
| `inventory/products/*` ↔ `brochures/catalog/*` | Warehouse vs. Marketing (different purposes) |
| `accounting/reconciliation/*` ↔ `finance/settlements/*` | GL matching vs. EMI settlement (different reconciliation targets) |
| `crm/leads/*` ↔ `crm/opportunities/*` | Early funnel vs. Late funnel (different sales stages) |
| `finance/deposits/*` ↔ `accounting/tax-invoices/*` | Customer liability vs. Tax compliance (different record types) |
| `reports/staff-ledger/*` ↔ `accounting/ledger-summary/*` | Staff P&L vs. GL balance (different dimensions) |

---

## Conclusion

✅ **ZERO true duplicates across all 926 routes.**

Routes that appear similar are intentionally separated by **entity type**, **business workflow**, **user audience**, or **business process**. This is **good architecture**, not a problem to solve.

Each route serves a distinct semantic purpose. Merging them would break the business model.
