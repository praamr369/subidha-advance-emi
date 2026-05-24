# Subidha Print Document Design System

Status: **PHASE 3C IMPLEMENTED ON `update` BRANCH**

This document records the branded print/PDF document system for SUBIDHA CORE. Print pages are intentionally read-only and payload-driven. They display backend-provided records and must not mutate financial, stock, delivery, subscription, EMI, waiver, lucky draw, rent/lease deposit, billing, refund, possession, return-inspection, commission, payout, cancellation, reversal, vendor payable, purchase, inventory valuation, cashier settlement, payment, receipt, reconciliation, allocation, money movement, journal, finance account, source lifecycle, or accounting records.

## Shared frontend primitives

Shared document components live under:

```text
frontend/src/components/documents/
```

Core primitives:

- `DocumentPage`
- `DocumentHeader`
- `DocumentTitleStrip`
- `DocumentPartyPanel`
- `DocumentMetadataGrid`
- `DocumentLineItemsTable`
- `DocumentAmountSummary`
- `DocumentTermsBlock`
- `DocumentAuditFooter`
- `DocumentSignatureBlock`
- `PrintToolbar`

Shared theme and formatter utilities live under:

```text
frontend/src/lib/documents/document-theme.ts
frontend/src/lib/documents/formatters.ts
```

The formatter layer centralizes INR display, Indian date/date-time display, safe fallbacks, normalized status labels, unsafe status labels, unsafe status watermarks, unsafe warning messages, and positive amount checks.

Current shared unsafe statuses include:

```text
CANCELLED
VOID / VOIDED
REVERSED
RETURNED
DRAFT
CLOSED
INACTIVE
DEFAULTED
FAILED
```

Document-specific warning states:

- Cashier day-close reports show an explicit **UNBALANCED** watermark/warning when backend `variance` is non-zero.
- Reconciliation reports show **UNRECONCILED** when backend run totals expose open exceptions or high-risk items.

## Dashboard-shell isolation

Print routes are routed outside the operational dashboard chrome by:

```text
frontend/src/components/layout/AdminShellRouter.tsx
frontend/src/app/(dashboard)/admin/layout.tsx
```

`AdminShellRouter` keeps admin role protection active but bypasses `DashboardShell` for document routes ending in:

```text
/print
/contract/print
/voucher/print
```

This prevents sidebar, topbar, command palette triggers, quick-action buttons, workspace menus, and setup banners from contaminating print previews or browser PDFs.

## Print CSS rules

`DocumentPage` provides print-safe CSS for:

- A4 page sizing with controlled margins.
- screen document preview and static print flow.
- hiding toolbar during print.
- hiding screen-only navigation with `.document-screen-only` and `[data-print-hidden]`.
- hiding non-document `header`, `nav`, `aside`, dashboard shell, dashboard sidebar/topbar, and document link strips during print.
- preventing page breaks inside cards, totals, rows, tables, and signatures.
- readable table headers and white print backgrounds when browser background graphics are disabled.
- light watermarks that do not block text.

## Implemented print routes and entry points

| Document | Print route | Source contract | UI entry point | Route helper |
|---|---|---|---|---|
| Direct Sale Invoice | `/admin/billing/direct-sale/[id]/print` | `GET /billing/direct-sales/:id/` | Direct-sale workspace row action `Invoice PDF` | `buildAdminDirectSalePrintRoute(id)` |
| Payment / EMI Receipt | `/admin/billing/receipts/[id]/print` | `GET /billing/receipts/:id/` | Receipt register row action `Print / Save PDF` | `buildAdminBillingReceiptPrintRoute(id)` |
| Direct Sale Delivery Challan | `/admin/deliveries/direct-sale-cases/[caseId]/print` | `GET /admin/deliveries/direct-sale-cases/:caseId/` | Delivery case detail `Delivery Challan / Print` | `buildAdminDirectSaleDeliveryChallanPrintRoute(id)` |
| Lucky Plan / Subscription Contract | `/admin/subscriptions/[id]/contract/print` | `GET /admin/subscriptions/:id/`, optional `GET /admin/customers/:id/` | Subscription detail `Contract PDF / Print` | `buildAdminSubscriptionContractPrintRoute(id)` |
| Rent / Lease Contract | `/admin/rent-lease/contracts/[id]/contract/print` | `GET /admin/subscriptions/:id/`, optional `GET /admin/customers/:id/`, optional `GET /admin/contracts/:id/possession/` | Subscription detail `Rent / Lease Contract PDF / Print` only when `plan_type` is `RENT`/`LEASE` and matching profile exists | `buildAdminRentLeaseContractPrintRoute(id)` |
| Purchase Bill / Vendor Bill | `/admin/purchases/[id]/bill/print` | `GET /inventory/vendor-bills/:id/`, optional `GET /admin/vendors/:id/`, optional `GET /admin/vendors/:id/outstanding/` | Vendor bills list row action `Purchase Bill PDF / Print` | `buildAdminPurchaseBillPrintRoute(id)` |
| Vendor Payment Voucher | `/admin/vendors/payments/[id]/voucher/print` | `GET /inventory/vendor-payments/:id/`, optional `GET /inventory/vendor-bills/:id/`, optional `GET /admin/vendors/:id/`, optional `GET /admin/vendors/:id/outstanding/` | Vendor payments list row action `Vendor Payment Voucher PDF / Print` | `buildAdminVendorPaymentVoucherPrintRoute(id)` |
| Cashier Day Close Report | `/admin/settlements/day-closes/[id]/print` | `GET /admin/settlements/cashier-day-closes/:id/` | Day-close register/review actions `Day Close Report PDF / Print` | `buildAdminCashierDayClosePrintRoute(id)` |
| Reconciliation Report | `/admin/reconciliation/reports/[id]/print` | `GET /admin/reconciliation/runs/:id/` and `GET /admin/reconciliation/items/?run=:id` | Reconciliation run history/detail actions `Reconciliation Report PDF / Print` | `buildAdminReconciliationReportPrintRoute(id)` |

## Document-specific safety notes

### Direct Sale Invoice

Uses existing direct-sale payload fields for invoice/sale references, customer snapshot, lines, totals, received amount, balance due, invoice status, and payment state. The page does not post payments, update invoice state, generate receipts, move stock, or alter delivery readiness.

### Payment / EMI Receipt

Uses existing receipt payload fields only. Unsafe receipt statuses render visible warning and watermark. Voided, cancelled, or reversed receipts are retained for audit and are not proof of active payment.

### Direct Sale Delivery Challan

Uses existing delivery payload fields only. Payment-exception release documents explicitly state that delivery was operationally released, receivable remains collectible, and approval does not settle payment. The page does not schedule, dispatch, cancel, note, move stock, mark delivered, or approve exceptions.

### Lucky Plan / Subscription Contract

Uses existing admin subscription/customer payload fields only. It does not build an EMI schedule or calculate EMI from product price. Winner/waiver notes are display-only and only reflect backend winner/waiver fields.

### Rent / Lease Contract

Uses existing subscription, rent/lease profile, customer, financial summary, and optional possession payload fields only. The page does not generate billing schedules or calculate rent, lease amount, deposit, refund, deduction, outstanding balance, due dates, possession, or return condition.

### Purchase Bill / Vendor Bill

Uses existing vendor bill, vendor, and vendor outstanding payloads only. It does not calculate bill totals, tax, payable, inventory value, stock receipt status, or accounting truth. Unsafe purchase statuses show warning/watermark.

### Vendor Payment Voucher

Uses existing vendor payment, optional vendor bill, vendor, and vendor outstanding payloads only. It does not calculate allocation, payable balance, accounting posting, reconciliation state, or settlement truth.

### Cashier Day Close Report

Uses existing admin day-close payload fields only: close number, cashier, branch/counter, finance account, business date, opening cash, system cash, counted/declared cash, variance, status, closed/approved metadata, notes, and optional metadata-provided counts/method summaries. It does not calculate cashier totals, variance, expected cash, declared cash, payment counts, receipt counts, or reconciliation status.

### Reconciliation Report

Uses existing Control Tower reconciliation run and item payloads only:

- run/report reference from `run_no`.
- scope/module as report type/source.
- date period from `date_from`/`date_to` or `started_at`.
- status from backend run status.
- prepared by from `started_by_username`.
- generated/finished timestamps from backend run timestamps.
- total source records, matched count, exception count, and high-risk count from run fields.
- expected, matched, unmatched, and variance amounts only when backend run `metadata` exposes them.
- source references and exception table from backend reconciliation item rows.

The page does **not** recalculate expected amount, matched amount, unmatched amount, variance, exception count, reconciliation status, ledger state, or accounting truth. It does not create or mutate reconciliation items, settlements, payments, receipts, money movements, journal entries, finance accounts, source lifecycle events, operational cancellations, or accounting records. Runs with failed/cancelled/incomplete status or open exceptions must not be treated as fully reconciled.

## Global financial and audit safety rules

1. Print pages are read-only.
2. Browser print is allowed; application mutation is not.
3. No frontend recalculation of financial truth.
4. No fake totals, tax values, payment references, receipt references, report references, or source references.
5. No fake EMI schedules, rent/lease schedules, purchase totals, payable balances, cashier totals, reconciliation counts, variance, or ledger status.
6. Missing optional display values must use safe fallbacks such as `—`.
7. Unsafe states must not visually appear as normal active/paid/settled/reconciled records.
8. Outstanding balances, variance, and exceptions must remain visible when backend payloads expose them.
9. Print views must not settle payments, close receivables/payables, post accounting, generate receipts/vouchers, reconcile items, approve/reject/reopen records, or mutate operational records.

## Deterministic test coverage

Current print smoke coverage:

```text
frontend/tests/e2e/document_print_smoke.spec.ts
frontend/tests/e2e/subscription_contract_print_smoke.spec.ts
frontend/tests/e2e/rent_lease_contract_print_smoke.spec.ts
frontend/tests/e2e/purchase_vendor_document_print_smoke.spec.ts
frontend/tests/e2e/cashier_day_close_print_smoke.spec.ts
frontend/tests/e2e/reconciliation_report_print_smoke.spec.ts
```

These tests use mocked API responses and do not depend on live shop data. They verify business identity, titles, references, key backend-provided figures, warnings/watermarks where practical, signatures, audit footer, print toolbar screen behavior, toolbar hiding under print media, absence of dashboard chrome, and deterministic operational entry-point links.

## Deferred document types

The following templates remain deferred until their existing route/data contracts are confirmed and wired safely:

- Subscription/rent/lease delivery challans beyond direct-sale delivery cases.
- Return inspection customer copy.
- Deposit refund advice.
- Purchase return / debit note customer-vendor copy.
- Vendor quote request / vendor quote comparison copy.
