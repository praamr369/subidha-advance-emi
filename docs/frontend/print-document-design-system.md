# Subidha Print Document Design System

Status: **PHASE 4A ACCOUNTING PRINT ROUTES IMPLEMENTED ON `update` BRANCH**

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
- Journal entry vouchers show unsafe status warnings for backend `DRAFT`, `VOID`, `VOIDED`, `REVERSED`, `CANCELLED`, `FAILED`, `UNBALANCED`, or related unsafe status labels when exposed.

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
| Journal Entry Voucher | `/admin/accounting/journals/[id]/print` | `GET /accounting/journal-entries/:id/` | Accounting journal register row action `Journal Entry PDF / Print` | `buildAdminJournalEntryPrintRoute(id)` |
| Ledger Account Statement | `/admin/accounting/ledger/[accountId]/statement/print` | `GET /accounting/reports/general-ledger/?account_id=:accountId&start_date=&end_date=` | Accounting Books finance-account card action `Ledger Statement PDF / Print` using linked chart account id | `buildAdminLedgerStatementPrintRoute(accountId, params)` |

## Accounting Phase 4A evidence-document rules

### Journal Entry Voucher

The journal entry voucher print route uses the existing `JournalEntry` detail payload only:

- entry number / journal reference.
- entry date / posting date.
- entry type.
- backend status.
- source type, source model, source id, source reference, and voucher type where exposed.
- backend created, posted, and approved metadata where exposed.
- memo / void reason where exposed.
- backend journal lines with chart account code, account name, line narration, debit amount, and credit amount.
- audit footer and prepared/approved signature blocks.

The print page does **not** calculate debit total, credit total, imbalance, posting state, approval state, reversal state, reconciliation state, or ledger balance. It does not create, post, approve, reverse, void, cancel, edit, or reconcile journal entries.

### Ledger Account Statement

The ledger account statement print route uses the existing backend general-ledger report payload only:

- account name.
- account code.
- account type.
- report period/date range.
- transaction rows from backend report rows.
- row date, journal reference, source reference, narration/memo, debit, credit, and backend running balance.
- backend closing balance.
- audit footer and prepared/reviewer signature blocks.

Opening balance is shown only when a backend report contract exposes it. The current general-ledger contract exposes closing balance and row running balances; it does not expose opening balance, so the print page shows a safe fallback for opening balance. The page does **not** calculate running balances, opening balance, closing balance, debit/credit totals, account state, or reconciliation state.

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

## Global financial and audit safety rules

1. Print pages are read-only.
2. Browser print is allowed; application mutation is not.
3. No frontend recalculation of financial truth.
4. No fake totals, tax values, payment references, receipt references, report references, source references, cashier counts, reconciliation counts, variance, debit/credit totals, ledger balances, running balances, journal status, ledger state, or accounting state.
5. Missing optional display values must use safe fallbacks such as `—`.
6. Unsafe states must not visually appear as normal active/paid/settled/reconciled/posted records.
7. Outstanding balances, variance, exceptions, unsafe statuses, and backend-exposed ledger balances must remain visible when backend payloads expose them.
8. Print views must not settle payments, close receivables/payables, post accounting, generate receipts/vouchers, reconcile items, approve/reject/reopen records, post/void/reverse journals, move stock, mutate finance accounts, or mutate operational records.

## Deterministic test coverage

Current print smoke coverage:

```text
frontend/tests/e2e/document_print_smoke.spec.ts
frontend/tests/e2e/subscription_contract_print_smoke.spec.ts
frontend/tests/e2e/rent_lease_contract_print_smoke.spec.ts
frontend/tests/e2e/purchase_vendor_document_print_smoke.spec.ts
frontend/tests/e2e/cashier_day_close_print_smoke.spec.ts
frontend/tests/e2e/reconciliation_report_print_smoke.spec.ts
frontend/tests/e2e/accounting_journal_ledger_print_smoke.spec.ts
```

These tests use mocked API responses and do not depend on live shop data. They verify business identity, document titles, references, key backend-provided figures, warnings/watermarks, signatures, audit footer, print toolbar screen behavior, toolbar hiding under print media, screen-only navigation hiding under print media, absence of dashboard chrome, and deterministic operational entry-point links.

Phase 4A added:

- Journal Entry Voucher print route smoke.
- Ledger Account Statement print route smoke.
- Journal register print-link smoke.
- Accounting Books ledger statement print-link smoke.

## Deferred document types

The following templates remain deferred until their existing route/data contracts are confirmed and wired safely:

- Subscription/rent/lease delivery challans beyond direct-sale delivery cases.
- Return inspection customer copy.
- Deposit refund advice.
- Purchase return / debit note customer-vendor copy.
- Vendor quote request / vendor quote comparison copy.
- Profit & Loss print report.
- Balance Sheet print report.
- Trial Balance print report.
