# ERP Transition Foundation

This document defines the additive enterprise foundation for evolving SUBIDHA CORE from a Lucky Plan EMI system into one admin platform that can replace day-to-day ERP usage for this business.

## Non-negotiable boundaries

- EMI schedules, payments, waivers, commissions, payouts, reconciliation, and audit history remain authoritative in the existing Lucky Plan core.
- Billing remains a separate document and contract-mirror module.
- Accounting remains a separate books and posting module.
- Inventory remains a separate stock module.
- Branch control remains a shared governance layer across operational modules, not a replacement for any one of them.
- Product master remains shared across subscriptions, inventory, and billing.
- All work stays additive and backward-compatible.

## Canonical enterprise admin modules

### 1. Control Center
- Dashboard
- Analytics
- Reports
- Support issues

Purpose:
- Run the daily operational cockpit without becoming a second business-event store.

### 2. Sales & Onboarding
- Leads
- Subscription requests
- Customers
- Subscriptions

Purpose:
- Move demand safely from lead or request into a real customer and contract record.

### 3. Collections & EMI
- Collections
- Payments
- EMI register
- Reminders
- Reconciliation

Purpose:
- Operate on the live EMI and payment truth without redefining installment obligations.

### 4. Fulfillment
- Deliveries
- Lucky IDs
- Lucky draws

Purpose:
- Keep delivery, draw, and contract state separate but operationally linked.

### 5. Catalog & Inventory
- Product master
- Batch control
- Inventory control

Purpose:
- Reuse one product master for selling, stock, and future ERP workflows.

### 6. Partner Finance
- Partners
- Commission finance
- Commission reconciliation
- Payout queue
- Payout batches

Purpose:
- Keep partner-facing finance explicit and traceable without collapsing it into customer collections.

### 7. Billing & Accounting
- Billing documents
- Billing contracts
- Accounting books and reports
- Bridge controls

Purpose:
- Extend the platform beyond EMI-only operations without replacing the existing Lucky Plan source of truth.

### 8. Governance
- Branches and counters
- Audit logs
- Settings and controls
- Access and users
- Masters
- Imports
- Finance configuration

Purpose:
- Keep admin controls, imports, and audit visibility explicit.

### 9. Branch control
- Branch master
- Cash counters / collection desks
- Branch-aware reporting

Purpose:
- Add multi-branch ownership, collection-desk discipline, and reporting scope across the existing modules without collapsing them into one shared branch table.

## Shared master-data direction

### Product master
- Product
- Category
- Subcategory
- SKU
- Unit of measure

Owns:
- Sellable catalog identity and shared metadata
- Canonical product code, SKU, and unit references
- The operator-approved category/subcategory/unit master set

Consumed by:
- Subscription onboarding
- Inventory
- Billing

Operational rule:
- `Product.category` and `Product.subcategory` string fields remain backward-compatible mirrors.
- Managed category/subcategory/unit master tables are the normalized source for future inventory and billing reuse.
- Preparing an inventory profile from product master is opt-in and must not change EMI, delivery, or payment truth by itself.

### Inventory extension
- Inventory item / stock profile
- Stock locations
- Opening stock posting
- Stock movements
- Stock adjustments
- Safe delivery-linked stock bridge

Owns:
- Stock and warehouse-facing state only

Consumes:
- Shared product master

Operational rule:
- Product remains the canonical catalog truth.
- Inventory profiles extend products with stock-facing governance only.
- Opening stock and later stock changes must post explicit stock ledger movements.
- Delivery-linked stock issue and return rows remain a bridge from fulfillment truth, not a rewrite of delivery state itself.
- Stock locations may carry branch ownership without changing stock ledger truth.

### Manufacturing-lite
- BOM header and lines
- Production jobs and WIP posture
- Raw-material issue and return correction
- Finished-goods receipt
- Scrap capture

Owns:
- production-control workflow only

Consumes:
- shared product and inventory master
- inventory stock service
- accounting bridge service

Operational rule:
- Manufacturing must not mutate stock or accounting by page edit.
- Raw-material issue, return correction, FG receipt, and scrap remain explicit job-level posting events.
- Accounting may mirror manufacturing cost movement when costing support is present, but manufacturing remains the operational source record.

### Billing mirror
- Direct-sale operational source records
- Billing profile / contract mirror
- Billing documents
- Billing receipts and notes

Owns:
- Commercial documents, direct-sale source records, and mirrored contract state only

Consumes:
- Subscription truth
- Delivery truth
- Payment and waiver trace events
- Shared product master

Operational rule:
- Direct sale stays separate from Lucky Plan subscription truth.
- Billing documents may mirror direct sale or subscription state, but they do not rewrite EMI obligations.
- Product, SKU, unit, and inventory profile references are reused from the shared product and inventory masters.

### Accounting
- Chart of accounts
- Finance accounts
- Periods and books
- Journal entries
- Voucher typing and posting-source trace fields
- Vendor master
- Purchase bills and expense vouchers
- Staff master, attendance basics, and salary register basics

Owns:
- Double-entry records and reports only

Consumes:
- Approved source events through controlled bridges

Operational rule:
- Accounting journal rows must remain traceable back to the source event through `source_model`, `source_id`, `voucher_type`, `source_type`, `source_reference`, and `AccountingBridgePosting`.
- Branch and counter context may be added to posting-source trace metadata, but accounting remains derivative and not the operational owner of branch state.
- Billing, payment, waiver, commission, payout, and inventory state do not become authoritative just because accounting posted a journal.
- Purchase, expense, salary, waiver, commission, payout, and payment-side events must enter accounting through their controlled service-layer posting bridges, not by mutating journals directly.

### Procurement and workforce readiness

Supports now:
- vendor-backed purchasing
- purchase-linked stock inward
- raw-material procurement readiness through inventory item typing
- manufacturing-lite through BOM, WIP, and finished-goods receipt
- expense-voucher posting
- staff master with compensation components
- attendance calendar and overtime capture
- leave types and leave requests
- payroll period close posture
- salary accrual, salary detail, and salary payment
- employee expense claims and reimbursement payment
- staff payable and reimbursement ledger

Deferred:
- payroll compliance automation
- rent or lease operational accounting
- advanced vendor procurement contracts

### CRM and party master
- Party master directory
- Party role links
- Contact interactions and follow-up history
- Cross-module timeline

Owns:
- Cross-reference identity and operator follow-up continuity only

Consumes:
- Lead, customer, partner, vendor, staff, direct-sale, billing, delivery, reminder, and support records

Operational rule:
- CRM does not replace `Customer`, `Partner`, `Vendor`, `EmployeeProfile`, or auth models.
- Party master links existing role-specific records together additively and keeps source trace explicit.
- Lead conversion into customer, direct sale, or subscription remains an explicit service-layer workflow.
- CRM may surface billing, delivery, and support events in one timeline, but it must not become a second hidden source of financial or contract truth.

### After-sales and service desk
- Complaint escalation
- Sales return cases
- Delivery return cases
- Exchange workflow
- Service tickets

Owns:
- bounded operational case records only

Consumes:
- support requests
- party master
- direct sales
- subscription deliveries
- billing invoices and notes
- inventory movement bridges

Operational rule:
- Service desk coordinates return and service workflows, but it does not become the source of billing, delivery, stock, or accounting truth.
- Return and service cases must trigger downstream note posting, delivery return, or stock movement through explicit service actions only.
- Exchanges remain separate return plus replacement records, not edits to historical sales.

## What this phase intentionally does not do

- No accounting engine rewrite of the Lucky Plan operational core
- No raw-material costing engine
- No rent/lease billing engine rewrite yet
- No full warranty entitlement engine or manufacturing-style service parts workflow yet

The goal of this phase is alignment and safe module boundaries, not a restart.
