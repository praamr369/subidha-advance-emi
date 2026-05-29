# Subidha Print Document Design System

Status: **PHASE 7G PRINT / DOCUMENT FINAL QA ON `update` BRANCH**

This document records the branded print/PDF document system for SUBIDHA CORE. Print pages are evidence documents, not posting engines. They are intentionally read-only and payload-driven. They display backend-provided records and must not mutate financial, stock, delivery, subscription, EMI, waiver, lucky draw, rent/lease deposit, billing, refund, possession, return-inspection, commission, payout, cancellation, reversal, vendor payable, purchase, inventory valuation, cashier settlement, payment, receipt, reconciliation, allocation, money movement, journal, finance account, source lifecycle, or accounting records.

## Phase 7G final QA rules

All print routes must remain branded, print-safe, role-safe, and backend-payload-driven.

Hard rules:

- Print pages must not post payment, generate receipt, create journal entry, reconcile, reverse, execute, roll back, move stock, allocate settlement, change EMI schedule, change rent/lease demand, mutate deposit/refund state, or update source business records.
- Financial values must come from backend payloads only.
- Missing optional financial values must render as `—`, not `₹0.00`.
- Real backend zero values such as `0`, `"0"`, or `"0.00"` may render as `₹0.00`.
- Unsafe statuses must show a visible watermark/warning when the route exposes an unsafe backend status.
- `PrintToolbar` is visible on screen and hidden in print media.
- `.document-screen-only`, dashboard chrome, sidebar/topbar, `nav`, operational actions, and `[data-print-hidden]` are hidden in print media.
- Customer print routes use customer-scoped APIs and must not expose other customers' documents.
- Product recontract addendum is available only when latest product recontract evidence is executed.

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

`formatDocumentMoney(value)` is intentionally conservative for Phase 7G: missing/empty/non-numeric values return `—`. Use backend-provided numeric/string values only. If the backend exposes a real zero, it renders as `₹0.00`.

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
- Finance account statements show **INACTIVE** when the backend finance account detail payload exposes `is_active=false`.

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

## Phase 5A Business Setup controlled print branding

Phase 5A adds editable print/PDF presentation settings controlled from Business Setup:

```text
/admin/settings/business-setup/print-branding
```

The frontend reads and writes settings through the existing admin Business Profile route convention:

```text
GET /admin/business-profile/?section=document-print-settings
PATCH /admin/business-profile/?section=document-print-settings
```

Backend storage is additive:

```text
DocumentPrintSettings
```

The settings are presentation-only. They control logo, print business name, tagline, print address/contact fields, tax label display, document-specific terms, footer note, signature labels, compact/comfortable density, show/hide logo, and show/hide watermark. They do not post, settle, reverse, reconcile, allocate, calculate, approve, cancel, return, move stock, mutate accounting, mutate journals, mutate finance balances, mutate payouts, mutate commissions, or mutate audit truth.

Uploaded print logos are stored in media storage through the backend `business_logo` field. Uploaded logos must be image files and are validated by extension, MIME type, and size. If no uploaded logo exists, documents fall back to the static frontend logo path. Uploaded logo files must never be committed to Git.

All document print routes use `DocumentPage`, `DocumentHeader`, `DocumentTermsBlock`, `DocumentSignatureBlock`, and `DocumentAuditFooter`, so they automatically consume the Business Setup print settings. If the settings API fails, the shared shell falls back to the static Subidha theme and the document still renders.

Document-specific terms are selected by route:

- Direct sale invoice: `invoice_terms`.
- Billing receipt: `receipt_terms`.
- Direct-sale delivery challan: `delivery_challan_terms`.
- Lucky Plan / Advance EMI contract: `subscription_contract_terms`.
- Rent / Lease contract: `rent_lease_contract_terms`.
- Purchase bill: `purchase_bill_terms`.
- Vendor payment voucher: `vendor_voucher_terms`.
- Ledger, finance account, and customer statements: `account_statement_terms`.
- Internal reports and audit footers: `report_footer_note`.

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
| Finance Account Statement | `/admin/finance/accounts/[id]/statement/print` | `GET /accounting/finance-accounts/:id/` and `GET /accounting/reports/cashbook/?finance_account_id=:id&start_date=&end_date=` | Accounting Books finance-account card action `Finance Account Statement PDF / Print` | `buildAdminFinanceAccountStatementPrintRoute(id, params)` |
| Customer Account Statement | `/admin/customers/[id]/statement/print` | `GET /admin/customers/:id/`, `GET /admin/subscriptions/?customer=:id`, `GET /admin/payments/?customer=:id` | Customer detail `Customer Account Statement PDF / Print` | `buildAdminCustomerAccountStatementPrintRoute(id, params)` |
| Product Recontract Addendum | `/admin/contract-amendments/[id]/recontract-addendum/print` and `/customer/contract-amendments/[id]/recontract-addendum/print` | `GET /admin/contract-amendments/:id/` or `GET /customer/contract-amendments/:id/` | Amendment detail `Recontract Addendum / Print` only when latest recontract evidence is executed | `buildAdminProductRecontractAddendumPrintRoute(id)`, `buildCustomerProductRecontractAddendumPrintRoute(id)` |
| Contract Amendment Decision Sheet | `/admin/contract-amendments/[id]/decision-sheet/print` | `GET /admin/contract-amendments/:id/` | Amendment detail `Decision Sheet / Print` | — |

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

## Accounting Phase 4B evidence-document rules

### Finance Account Statement

The finance account statement print route uses two existing read contracts only:

```text
GET /accounting/finance-accounts/:id/
GET /accounting/reports/cashbook/?finance_account_id=:id&start_date=&end_date=
```

The finance account detail payload provides account identity and setup state:

- finance account name.
- finance account kind/type.
- linked chart account code/name.
- branch code/name when exposed.
- active/inactive state.

The cashbook report payload provides backend statement rows and backend ledger-derived balance fields:

- report period/date range.
- transaction rows.
- row date.
- journal reference.
- source type / voucher type / source reference where exposed.
- narration/memo/description where exposed.
- backend debit amount.
- backend credit amount.
- backend running balance.
- backend closing balance.

Opening balance and reconciliation status are shown only when a backend report contract exposes them. The current cashbook/general-ledger-backed contract exposes row running balances and closing balance but does not expose opening balance or reconciliation status, so the print page uses safe fallbacks for those fields.

The print page does **not** calculate opening balance, closing balance, running balance, inflow/outflow totals, variance, reconciliation state, account health, or finance account truth. It does not mutate finance accounts, money movements, settlements, payments, receipts, journal entries, cash counters, reconciliation rows, vendor records, inventory, EMI records, rent/lease deposits, or accounting records.

## Phase 4C customer evidence-document note

### Customer Account Statement

`/admin/customers/:id/statement/print` is a read-only customer account summary/evidence document. It uses existing customer, subscriptions, and payments read APIs only. It does **not** calculate running balance or total outstanding until a backend customer statement ledger exists. Direct-sale and rent/lease totals are deferred and must not be inferred in this print view. Full route notes are recorded in `docs/frontend/customer-account-statement-print.md`.

## Phase 6G product recontract addendum

`/admin/contract-amendments/:id/recontract-addendum/print` and `/customer/contract-amendments/:id/recontract-addendum/print` are printable evidence documents for executed product recontract amendments only.

The addendum uses the existing amendment detail payload and `latest_product_recontract_preview` execution evidence. It shows business print branding, amendment/subscription/customer references, customer consent timestamp, admin approval timestamp, execution timestamp, old/new product and financial terms, pending EMI schedule preview line impact, accounting bridge/journal references, reconciliation run/item/evidence references, a customer-facing ledger statement, protection statements, signatures, and audit footer.

Phase 6G is print/document only. It adds no backend mutation behavior, no execution logic, and no rollback/reversal behavior. It does not mutate subscription, EMI, payment, receipt, accounting, reconciliation, settlement, day-close, inventory, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records.

Historical payments and receipts remain unchanged. The customer ledger section is display-only and explicitly does not create payment, receipt, refund, or settlement.

## Phase 8G Printable Amendment Decision Sheet

`/admin/contract-amendments/:id/decision-sheet/print` is a printable evidence document for amendment requests, showing the audit timeline and workflow decision boundaries.

The decision sheet uses the existing amendment detail payload, including `audit_timeline` and `decision_sheet_summary`. It shows business print branding, amendment reference, customer/contract reference, request values, admin decision values, and available preview summaries (such as Lucky ID batch conflicts, Rent/Lease analysis, or Deposit risk checks).

Phase 8G is print/document only. It does not mutate any source records. It explicitly includes the statement:
> "This document is read-only evidence. It does not create payment, receipt, accounting, reconciliation, stock, delivery, lucky draw, waiver, commission, payout, rent/lease demand, deposit, or contract mutation."

## Phase 7G audit checklist

The following routes were audited for Phase 7G:

- `/admin/billing/direct-sale/[id]/print`
- `/admin/billing/receipts/[id]/print`
- `/admin/deliveries/direct-sale-cases/[caseId]/print`
- `/admin/subscriptions/[id]/contract/print`
- `/admin/rent-lease/contracts/[id]/contract/print`
- `/admin/contract-amendments/[id]/recontract-addendum/print`
- `/customer/contract-amendments/[id]/recontract-addendum/print`
- `/admin/accounting/journals/[id]/print`
- `/admin/accounting/ledger/[accountId]/statement/print`
- `/admin/finance/accounts/[id]/statement/print`
- `/admin/customers/[id]/statement/print`

Audit result:

- shared branding is provided by `DocumentHeader` and Business Setup print settings.
- print toolbar is hidden in print media.
- dashboard chrome is hidden by print shell bypass and print CSS.
- `.document-screen-only` content is hidden in print media.
- unsafe statuses are supported by shared watermark/warning helpers and route-specific guards where backend status is exposed.
- signature blocks and audit footers are present on audited routes.
- terms blocks are present where route context requires them.
- missing optional fields use safe text or money fallbacks.
- product recontract addendum is guarded to executed product recontract evidence only.

## Validation commands

Frontend:

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
npm run check:routes
npx playwright test tests/e2e/document_print_smoke.spec.ts --project=chromium-smoke --timeout=180000
npx playwright test tests/e2e/subscription_contract_print_smoke.spec.ts --project=chromium-smoke --timeout=180000
npx playwright test tests/e2e/rent_lease_contract_print_smoke.spec.ts --project=chromium-smoke --timeout=180000
npx playwright test tests/e2e/accounting_journal_ledger_print_smoke.spec.ts --project=chromium-smoke --timeout=180000
npx playwright test tests/e2e/customer_account_statement_print_smoke.spec.ts --project=chromium-smoke --timeout=180000
npx playwright test tests/e2e/contract_recontract_addendum_print.spec.ts --project=chromium-smoke --timeout=180000
```

Backend is not required for Phase 7G unless backend serializers/settings are changed.

Do not run:

```bash
bash scripts/run-release-candidate.sh
```
