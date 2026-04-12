# Admin Enterprise Workspace

This guide explains how admin users should navigate SUBIDHA CORE as one enterprise workspace while the system transitions away from third-party ERP usage.

## Start from the admin dashboard

Primary route:
- `/admin`

Use the dashboard for:
- overdue EMI follow-up
- reminder backlog (pending/failed)
- flagged reconciliation attention
- pending delivery actions
- branch and counter collection posture
- cash / bank / UPI payment-mode split
- branch-wise collections
- batch fill and draw readiness
- inventory and raw-material reorder alerts
- purchase, payroll, and reimbursement follow-up
- service-desk and complaint queues
- onboarding handoff into CRM, direct sale, or EMI subscription

The dashboard is not a second source of financial truth. It is a routing workspace into the canonical operational pages.

## Attention-first dashboard posture

The admin cockpit keeps urgency ahead of analytics:

1. Needs Immediate Action
   - overdue EMI follow-up
   - reconciliation flags
   - reminder dispatch backlog
   - delivery pending queue
   - service-desk + support queue
   - purchase/payroll/reimbursement pending posture
   - onboarding and lead handoff backlog
2. Collections cockpit and payment-mode split
3. Secondary performance and trend surfaces

Operators should close the immediate-action queue before day-end analytics review.

## Canonical sidebar sections

The admin sidebar is grouped and collapsible. Operators should keep the daily Lucky Plan lane open and expand specialist modules only when they are working that area.

### Lucky Plan Operations
- `/admin`
- `/admin/subscriptions`
- `/admin/emis`
- `/admin/collections`
- `/admin/payments`
- `/admin/batches`
- `/admin/lucky-ids`
- `/admin/lucky-draws`
- `/admin/reminders`
- `/admin/reconciliation`

### CRM & Parties
- `/admin/crm`
- `/admin/crm/leads`
- `/admin/crm/parties`
- `/admin/crm/parties/{id}`
- `/admin/customers`
- `/admin/subscription-requests`
- `/admin/support-requests`

### Direct Sales & Billing
- `/admin/billing`
- `/admin/billing/register`
- `/admin/billing/direct-sales`
- `/admin/billing/invoices`
- `/admin/billing/receipts`
- `/admin/billing/contracts`
- `/admin/billing/credit-notes`
- `/admin/billing/debit-notes`

### Inventory & Procurement
- `/admin/products`
- `/admin/inventory`
- `/admin/inventory/items`
- `/admin/inventory/locations`
- `/admin/inventory/ledger`
- `/admin/inventory/adjustments`
- `/admin/inventory/opening-stock`
- `/admin/accounting/purchase-bills`
- `/admin/accounting/vendors`

### Manufacturing
- `/admin/manufacturing`
- `/admin/manufacturing/boms`
- `/admin/manufacturing/jobs`

### Service Desk
- `/admin/service-desk`
- `/admin/service-desk/complaints`
- `/admin/service-desk/returns`
- `/admin/service-desk/tickets`
- `/admin/service-desk/cases/{id}`

### Accounting & Finance
- `/admin/accounting`
- `/admin/accounting/chart-of-accounts`
- `/admin/accounting/journals`
- `/admin/accounting/books`
- `/admin/accounting/books/cash`
- `/admin/accounting/books/bank`
- `/admin/accounting/books/upi`
- `/admin/accounting/gst`
- `/admin/accounting/reports/trial-balance`
- `/admin/accounting/reports/profit-loss`
- `/admin/accounting/reports/balance-sheet`
- `/admin/accounting/bridges`
- `/admin/partners`
- `/admin/finance/commissions`
- `/admin/finance/commissions/settled`
- `/admin/finance/payout-batches`
- `/admin/finance/reconciliation`

### Payroll & Workforce
- `/admin/accounting/staff`
- `/admin/accounting/attendance`
- `/admin/accounting/leave`
- `/admin/accounting/salary`
- `/admin/accounting/salary/{id}`
- `/admin/accounting/expense-claims`
- `/admin/accounting/staff-ledger`

### Branches & Counters
- `/admin/branches`
- `/admin/counters`
- `/admin/branch-reporting`

### Reports & Governance
- `/admin/reports`
- `/admin/analytics`
- `/admin/audit-logs`
- `/admin/settings/imports`
- `/admin/settings/masters`
- `/admin/settings`

## Compatibility paths

Some older paths still exist so imported links, bookmarks, and compatibility helpers do not break.

Examples:
- `/admin/lucky-draw`
- `/admin/finance/commisions`
- `/admin/partners/commisions`
- `/admin/partner/commisions`
- `/admin/emi/overdue`

These are compatibility-only. Daily navigation should use the canonical sidebar routes.

## Shared master-data rule for operators

When staff need to change master data:

1. Start at product master first.
2. Maintain category, subcategory, and unit masters from `/admin/products/masters`.
3. Keep SKU and product code at the individual product level.
4. Extend into inventory only for stock-tracked items by preparing the inventory profile from the product workspace.
5. Use direct sales for non-EMI retail orders and keep them separate from Lucky Plan subscriptions.
6. Use billing contracts and documents as mirrors, not contract truth.
7. Use accounting masters and bridges for books, not for direct operational editing.
8. Assign a real finance account on payout batches before finalization when partner payout should appear in cash, bank, or UPI books.
9. Maintain vendors, purchase bills, expenses, staff, and salary sheets inside the accounting workspace instead of overloading billing, payments, or subscription records.
10. Use the CRM party directory as the shared operator identity surface across leads, customers, partners, vendors, and staff, but keep edits to the original source modules.
11. Use manufacturing only for BOM governance and production control; do not simulate production by editing stock or journal rows directly.
12. Use branch and counter masters for branch-safe collections, stock ownership, and reporting instead of assuming one shared shop context forever.

This keeps one source of truth per domain and prevents ERP-style duplication drift.

## Product master operator workflow

Use the product area in this order:

1. `/admin/products/masters`
   - add or review category, subcategory, and unit masters
2. `/admin/products/create` or `/admin/products/{id}/edit`
   - create or update product code, SKU, price, description, and plan capability flags
3. `/admin/products/{id}`
   - prepare the inventory profile only when the product should participate in stock workflows
4. `/admin/inventory/locations`
   - maintain store, warehouse, and showroom stock locations for daily operations
5. `/admin/inventory/items`
   - govern stock-facing profile fields such as default location, reorder level, stock item type, and delivery bridge participation
6. `/admin/products/import`
   - bulk import product rows only after master values are approved

Guardrails:
- Product base price remains the contract total; this workflow does not redefine EMI pricing.
- CSV import extends product master metadata safely and must not create a second financial truth.
- Inventory preparation is catalog-to-stock setup only; it does not post stock or billing events.
- Inventory adjustments and opening stock remain explicit operational stock postings, not catalog edits.
- Stock locations should be linked to the correct branch when multi-branch warehouse visibility is active.

## Branch-control operator workflow

Use the branch-control workspace in this order:

1. `/admin/branches`
   - create the primary branch first
   - add secondary branches only when they are ready for live operations
2. `/admin/counters`
   - create counters and map them to branch-safe finance accounts
   - assign cashier users where possible
3. `/admin/inventory/locations`
   - link stock locations to the correct branch
4. `/admin/billing/direct-sales` or `/admin/payments/create`
   - select branch and counter explicitly when the transaction should not fall back to the primary branch
5. `/admin/branch-reporting`
   - review collections, direct sales, stock, overdue EMI, and people costs by branch

Guardrails:
- Branch control adds shared governance only; it does not replace subscription, payment, billing, inventory, or accounting truth.
- Counter mapping must stay consistent with the finance account and branch.

## Manufacturing operator workflow

Use the manufacturing workspace in this order:

1. `/admin/manufacturing/boms`
   - create or revise the BOM against the finished-good and raw-material inventory profiles
2. `/admin/manufacturing`
   - review released, in-progress, completed, and deferred production posture
3. `/admin/manufacturing/jobs`
   - create the production job and release it only when the shop floor is ready
4. `/admin/manufacturing/jobs/{id}`
   - post raw-material issue
   - post return correction when excess raw material comes back from production
   - post finished-goods receipt
   - record scrap or wastage
   - complete the job only after WIP clears

Guardrails:
- Procurement remains the source of raw-material inward.
- Manufacturing consumes raw stock and produces finished-good stock through explicit job posting only.
- If costing is incomplete, the job may stay accounting-deferred instead of inventing unsafe finance values.

## Procurement and workforce operator workflow

Use the accounting workspace in this order when running purchase, expense, or salary operations:

1. `/admin/accounting/vendors`
   - maintain the supplier or service-provider master first
2. `/admin/accounting/purchase-bills`
   - create draft purchase bills for stock inward and raw-material procurement
3. `/admin/accounting/expenses`
   - use expense vouchers for non-stock operating costs
4. `/admin/accounting/staff`
   - maintain staff profiles, daily hours, overtime posture, and recurring compensation components
5. `/admin/accounting/attendance`
   - record daily attendance and review the attendance calendar
6. `/admin/accounting/leave`
   - create leave types and approve or reject leave requests
7. `/admin/accounting/salary`
   - create, approve, post, and pay salary sheets
8. `/admin/accounting/expense-claims`
   - create, approve, post, and reimburse staff expense claims
9. `/admin/accounting/staff-ledger`
   - review salary and reimbursement balances by employee
10. `/admin/accounting/books`
   - review the resulting books after controlled posting

Guardrails:
- Purchase bills are for stock inward; use expense vouchers for non-stock costs.
- Staff master stays separate from authentication and role assignment.
- Attendance, leave, and expense claims are blocked by closed payroll periods.
- Approved leave writes attendance rows explicitly.
- Salary and reimbursement payments must follow posted accruals and use the correct finance account.

## CRM and party operator workflow

Use the CRM workspace in this order:

1. `/admin/crm`
   - review lead pipeline, recent parties, and due follow-ups
2. `/admin/crm/leads`
   - review lead rows with linked party continuity and follow-up state
3. `/admin/leads/{id}`
   - continue the operational handoff into customer, direct-sale, or subscription creation
4. `/admin/crm/parties`
   - search the shared party directory across lead, customer, partner, vendor, and staff roles
5. `/admin/crm/parties/{id}`
   - review the cross-module timeline and record follow-up notes or handoff history

Guardrails:
- CRM is not a replacement for finance, billing, inventory, delivery, or subscription truth.
- Party master links source records together; it does not own customer KYC, vendor settlement, payroll, or contract math.
- Lead conversion remains explicit and auditable.
- Follow-up reminders created from CRM are operator reminders, not financial due recalculations.

## Service-desk operator workflow

Use the after-sales workspace in this order:

1. `/admin/service-desk/complaints`
   - review complaint intake and existing support-request linkage
2. `/admin/service-desk/returns`
   - create sales-return, delivery-return, or exchange cases
3. `/admin/service-desk/tickets`
   - create or review repair, warranty, or inspection tickets
4. `/admin/service-desk/cases/{id}`
   - authorize the case
   - request or complete delivery return when linked
   - post the credit note or debit note when required
   - link replacement direct sale for exchanges
   - resolve and close the case

Guardrails:
- Do not edit historical invoices, stock movements, or journals to simulate a return.
- Delivery-linked return stock must keep using the delivery bridge.
- Direct-sale return stock must keep using the posted credit-note stock effect.
- Service desk is orchestration and audit context only; billing, inventory, delivery, and accounting remain separate truths.

## Print and PDF presentation standard

For operator/customer printouts and browser PDF exports:

- use business-safe document titles (receipt, invoice, credit note, debit note, contract summary)
- show only practical fields:
  - party block (customer/party identity, contact, branch/counter when relevant)
  - reference block (document number, source reference, payment/installment context)
  - amount summary (subtotal/tax/total/received/balance or note adjustment totals)
  - concise details (status, journal reference, remarks)
- keep operational source linkage visible without dumping raw internal payload fields
- retain canonical truth boundaries:
  - receipts do not rewrite payment truth
  - billing mirrors do not replace subscription truth
  - print documents are presentational outputs, not posting controls
