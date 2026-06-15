# SUBIDHA CORE Admin Module Taxonomy

This document defines the canonical admin module structure for SUBIDHA CORE.

The goal is operational clarity without breaking existing data, endpoints, EMI logic, payment history, audit logs, subscriptions, lucky draw workflows, commissions, payout workflows, reconciliation, or rent/lease extension paths.

## Non-breaking rules

- Keep current routes working until a route is explicitly classified as removable.
- New module routes must be additive aliases or new thin pages first.
- Moving a page must not change backend source records.
- No UI cleanup may auto-create journals, money movements, receipts, payments, salary payments, reconciliation items, stock movements, commissions, or payout records.
- Financial and accounting workflows remain explicit, audited, and bridge-controlled.
- Object/profile pages show related records; they must not hide financial side effects behind convenience buttons.

## Canonical modules

| Module | Purpose | Canonical route family | Owns | Must not own |
|---|---|---|---|---|
| Command Center | Daily owner/admin control | `/admin`, `/admin/operations/*` | Urgent queues, daily KPIs, cross-module links | Source transaction mutation except explicit existing quick links |
| Profiles & Parties | Master identity layer | `/admin/profiles/*` | Customers, partners, vendors, staff, branches, parties, KYC/contact links | Payments, invoices, journals, stock movements |
| CRM & Requests | Demand, follow-up, requests | `/admin/crm/*`, `/admin/requests/*` | Leads, pipeline, follow-ups, support intake, KYC queues, partner/customer requests | Silent contract/payment/accounting creation |
| Sales & Contracts | Customer business creation | `/admin/sales/*`, `/admin/subscriptions/*`, `/admin/rent-lease/*` | Direct sale, Advance EMI contracts, rent/lease contracts, amendments | Receipt posting, journal posting, delivery stock-out |
| Lucky Plan Control | Lucky Plan-specific operations | `/admin/lucky-plan/*` | Batches, Lucky IDs, draws, winners, waiver evidence | Generic subscription/rent/lease operations |
| Collections & Cashier | Money collection operations | `/admin/collections/*`, `/cashier/*` | Cash/UPI/bank collection, receipts, cashier close, settlement evidence | Accounting close, bridge auto-post, fake reconciliation |
| Finance Operations | Source-of-money operations | `/admin/finance/*` | Outstandings, advances, deposits, refunds, commissions, payouts, payables | COA, journals, accounting period close |
| Accounting & Reconciliation | Ledger and audit control | `/admin/accounting/*` | COA, mappings, journals, bridge posting, periods, books, TB/P&L/BS | Operational source creation |
| Inventory & Stock | Stock truth and movement | `/admin/inventory/*` | Stock on hand, ledger, locations, movements, adjustments, readiness | Purchase billing, customer receipts, accounting bridge auto-post |
| Purchases & Vendors | Procurement chain | `/admin/purchases/*`, `/admin/vendors/*` | RFQ, PO, receipt, purchase bill, vendor payable/payment/return | Customer CRM or sales contracts |
| Delivery & Service | Fulfillment, returns, cases | `/admin/deliveries/*`, `/admin/service-desk/*` | Delivery, handover, returns, complaints, service tickets | Sales invoice creation or receipt posting |
| HR & Staff | People operations | `/admin/hr/*` | Staff, attendance, payroll setup, salary sheets/payments, leave, expenses | Payroll journal auto-post from staff creation |
| BI & Reports | Read-only decision layer | `/admin/bi/*`, `/admin/reports*` | Trends, reports, saved views, operational analytics | Any mutation or repair action |
| Settings & Governance | System setup and policies | `/admin/settings/*`, `/admin/audit-*` | Users, permissions, compliance, policies, imports, numbering, setup | Daily transaction workflow ownership |

## Operational object-page standard

Most operational pages should converge to this structure:

1. Command header: object name, status, branch/context, safe next action.
2. Status summary: financial, stock, accounting, reconciliation, audit posture.
3. Work queue or blockers: the exact unresolved tasks.
4. Main register/table or object detail.
5. Detail drawer/object page sections.
6. Timeline/audit events.
7. Safe action footer with state-based buttons only.

## Cross-module chain of truth

### Sales / EMI / rent / lease

```text
Customer / Lead / Request
→ Contract or Direct Sale
→ Invoice / EMI demand / Rent demand
→ Collection
→ Receipt
→ Settlement / cash close
→ Accounting bridge
→ Reconciliation
→ Reports / BI
```

### Stock side

```text
Product selected
→ stock reservation
→ delivery / handover
→ stock movement
→ COGS / stock accounting bridge where approved
```

### Purchase side

```text
Vendor profile
→ purchase request
→ purchase order
→ purchase receipt
→ stock increase
→ purchase bill
→ vendor payable
→ vendor payment
→ accounting bridge
→ reconciliation
```

### Credit / debit / refund side

```text
Credit note / refund / reversal
→ customer credit or liability adjustment
→ controlled refund/payment
→ accounting bridge
→ reconciliation
```

## UI inspiration contract

SUBIDHA CORE UI should use a hybrid ERP pattern:

- SAP Fiori discipline for object pages, status clarity, strict actions, and audit workflows.
- Business Central role-center thinking for admin/cashier/partner/customer home pages.
- Odoo simplicity for module navigation and forms.
- ERPNext-style linked documents for customer → contract → EMI/payment/receipt/delivery timelines.
- NetSuite-style control dashboards for KPIs and queues.
- QuickBooks-style accounting clarity for invoices, receipts, cash/bank views.
- Shopify POS speed for cashier collection and retail inventory workflows.

Do not use over-animated, generic SaaS dashboard patterns for core financial operations.
