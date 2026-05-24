# Subidha Print Document Design System

Status: **PHASE 3D QA CONSOLIDATED ON `update` BRANCH**

This document records the branded print/PDF document system for SUBIDHA CORE. Print pages are evidence documents, not posting engines. They are intentionally read-only and payload-driven. They display backend-provided records and must not mutate financial, stock, delivery, subscription, EMI, waiver, lucky draw, rent/lease deposit, billing, refund, possession, return-inspection, commission, payout, cancellation, reversal, vendor payable, purchase, inventory valuation, cashier settlement, payment, receipt, reconciliation, allocation, money movement, journal, finance account, source lifecycle, or accounting records.

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

Shared unsafe statuses include:

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
REOPENED
INCOMPLETE
UNBALANCED
UNRECONCILED
```

Document-specific warning states:

- Cashier day-close reports show **UNBALANCED** when backend `variance` is non-zero.
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
- hiding non-document `header`, `nav`, `aside`, dashboard shell, dashboard sidebar/topbar, operational buttons, and document link strips during print.
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

## Phase 3 financial/audit route QA results

Audited Phase 3 routes:

```text
/admin/purchases/:id/bill/print
/admin/vendors/payments/:id/voucher/print
/admin/settlements/day-closes/:id/print
/admin/reconciliation/reports/:id/print
```

Confirmed:

- All four routes call read APIs only.
- No print route calls mutation endpoints.
- No route recalculates financial truth.
- Print toolbar is screen-only and hidden during print media.
- Screen-only back links are hidden during print media.
- Dashboard shell/sidebar/topbar/operational actions are hidden during print media.
- Audit footer and signature blocks remain printable.
- White print background and explicit borders keep documents readable when browser background graphics are disabled.

## Phase 3 evidence-document rules

### Purchase Bill / Vendor Bill

Uses existing vendor bill, vendor, and vendor outstanding payloads only. It does not calculate purchase totals, tax totals, payable, inventory value, stock receipt status, or accounting truth. Unsafe purchase statuses show warning/watermark.

### Vendor Payment Voucher

Uses existing vendor payment, optional vendor bill, vendor, and vendor outstanding payloads only. It does not calculate payment allocation, payable balance, accounting posting, reconciliation state, or settlement truth.

### Cashier Day Close Report

Uses existing admin day-close payload fields only: close number, cashier, branch/counter, finance account, business date, opening cash, system cash, counted/declared cash, variance, status, closed/approved metadata, notes, and optional metadata-provided counts/method summaries. It does not calculate cashier expected total, declared total, variance, payment counts, receipt counts, or reconciliation status.

### Reconciliation Report

Uses existing Control Tower reconciliation run and item payloads only. It does not recalculate expected amount, matched amount, unmatched amount, variance, exception count, reconciliation status, ledger state, or accounting truth. It does not create or mutate reconciliation items, settlements, payments, receipts, money movements, journal entries, finance accounts, source lifecycle events, operational cancellations, or accounting records.

## Global financial and audit safety rules

1. Print pages are read-only.
2. Browser print is allowed; application mutation is not.
3. No frontend recalculation of financial truth.
4. No fake totals, tax values, payment references, receipt references, report references, source references, cashier counts, reconciliation counts, variance, ledger state, or accounting state.
5. Missing optional display values must use safe fallbacks such as `—`.
6. Unsafe states must not visually appear as normal active/paid/settled/reconciled records.
7. Outstanding balances, variance, and exceptions must remain visible when backend payloads expose them.
8. Print views must not settle payments, close receivables/payables, post accounting, generate receipts/vouchers, reconcile items, approve/reject/reopen records, move stock, mutate finance accounts, or mutate operational records.

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

These tests use mocked API responses and do not depend on live shop data. They verify business identity, document titles, references, key backend-provided figures, warnings/watermarks, signatures, audit footer, print toolbar screen behavior, toolbar hiding under print media, screen-only navigation hiding under print media, absence of dashboard chrome, and deterministic operational entry-point links.

Phase 3D tightened:

- Shared unsafe status labels for `REOPENED`, `INCOMPLETE`, `UNBALANCED`, and `UNRECONCILED`.
- Day-close smoke assertion for `UNBALANCED` watermark.
- Reconciliation smoke assertion for `UNRECONCILED` watermark.

## Deferred document types

The following templates remain deferred until their existing route/data contracts are confirmed and wired safely:

- Subscription/rent/lease delivery challans beyond direct-sale delivery cases.
- Return inspection customer copy.
- Deposit refund advice.
- Purchase return / debit note customer-vendor copy.
- Vendor quote request / vendor quote comparison copy.
- Accounting ledger/P&L/balance-sheet reports.
