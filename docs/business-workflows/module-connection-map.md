# Business workflows — module connection map

This folder documents **how existing modules connect** in the current codebase.

Rules:
- Document **only real UI routes that exist** in `docs/frontend/page-route-inventory.md`.
- Document **only operational connections**, not future plans.
- If a route name changes in code, update this doc in the same PR.

## Cross-module primitives (what ties modules together)

These are the main “join points” that connect day-to-day work:

- **Customer** → subscriptions, direct sales, delivery, service tickets
  - Customer register: `/admin/customers`
  - Customer detail: `/admin/customers/[id]`
- **Subscription contract** (Lucky Plan) → EMI schedule, payments/collections, lucky draw, waivers, reconciliation
  - Subscription register: `/admin/subscriptions`
  - Subscription detail: `/admin/subscriptions/[id]`
  - EMI schedule: `/admin/subscriptions/[id]/emis`
  - Cashier collection: `/cashier/collect`
- **Payments / receipts** → billing, accounting books, reconciliation, reversal controls
  - Payments register: `/admin/payments`
  - Payment detail: `/admin/payments/[id]`
  - Payment reconciliation: `/admin/payments/reconciliation`
- **Inventory stock movement** → purchase/vendor flows, direct sales, delivery/returns
  - Inventory workspace: `/admin/inventory/workspace`
  - Stock on hand: `/admin/inventory/stock-on-hand`
  - Stock movements: `/admin/inventory/movements`
- **Delivery fulfillment** → subscriptions/direct sales, inventory allocation, returns
  - Delivery workspace: `/admin/delivery/workspace`
  - Deliveries register: `/admin/deliveries`
  - Delivery detail: `/admin/deliveries/[id]`

## Module-to-module connection map (existing UI surfaces)

### Billing ↔ Accounting ↔ Reconciliation

- Billing produces receipts/payments that flow into:
  - Accounting books: `/admin/accounting/books`
  - Accounting journals: `/admin/accounting/journals`
  - Accounting reconciliation: `/admin/accounting/reconciliation`
  - Finance reconciliation: `/admin/finance/reconciliation`

### Subscriptions (Lucky Plan) ↔ Billing

- Subscriptions drive recurring collections and waivers:
  - Subscription detail → EMI schedule: `/admin/subscriptions/[id]/emis`
  - Cashier collections: `/cashier/collect`
  - Admin collections: `/admin/finance/collections`

### Subscriptions ↔ Lucky draw / waivers

- Draw operations and winner benefits are connected from subscription context:
  - Lucky draw register: `/admin/lucky-draws`
  - Lucky draw history: `/admin/lucky-draw/history`
  - Waivers: `/admin/waivers`

### Customers ↔ CRM ↔ Service desk

- CRM creates/qualifies customers and routes follow-ups into service:
  - CRM: `/admin/crm`
  - Leads: `/admin/leads`
  - Online enquiries: `/admin/online-enquiries`
  - Service desk: `/admin/service-desk`

### Inventory ↔ Delivery ↔ Returns / service

- Inventory provides stock visibility and movement records used for:
  - Delivery allocation/dispatch: `/admin/delivery/workspace`
  - Returns/service controls: `/admin/service`

### HR ↔ Accounting (attendance / payroll surfaces)

- HR operational work is connected to accounting-control pages:
  - HR workspace: `/admin/hr`
  - Attendance: `/admin/hr/attendance` (accounting mirror: `/admin/accounting/attendance`)
  - Payroll / salary: `/admin/hr/payroll` (accounting mirror: `/admin/accounting/salary`)

### Vendors / purchase ↔ Inventory ↔ Accounting

- Purchases feed stock movement, delivery readiness, and vendor settlements:
  - Purchases: `/admin/purchases`
  - Purchase orders: `/admin/purchases/orders`
  - Purchase bills: `/admin/purchases/bills`
  - Vendor register: `/admin/vendors`
  - Vendor detail: `/admin/vendors/[id]`

### Partners (admin control + partner workspace)

- Partner records connect collections, commissions, and payout controls:
  - Admin partners: `/admin/partners`
  - Partner payment requests: `/admin/partner-payment-requests`
  - Partner workspace: `/partner`

### Customer self-service (customer workspace)

- Customer views are scoped to the logged-in customer:
  - Customer workspace: `/customer`
  - Customer payments: `/customer/payments`
  - Customer documents: `/customer/documents`

## Admin command center surfaces (existing)

- Operations working screen (queues): `/admin/operations`
- Operations command center: `/admin/operations/command-center`
- Admin ERP workspace redirect: `/admin/workspace` → `/admin/erp`
