# Subidha Print Document Design System

Status: **PHASE 2D QA HARDENED ON `update` BRANCH**

This document records the branded print/PDF document system for SUBIDHA CORE. The system is intentionally read-only and payload-driven: printable pages display backend-provided business records and never mutate financial, stock, delivery-state, subscription-state, EMI, waiver, lucky draw, reconciliation, rent/lease deposit, billing, refund, possession, return-inspection, commission, payout, reversal, cancellation, or accounting records.

## Shared frontend document primitives

Reusable components live under:

```text
frontend/src/components/documents/
```

Components:

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

## Shared document theme and formatters

Shared configuration lives under:

```text
frontend/src/lib/documents/document-theme.ts
frontend/src/lib/documents/formatters.ts
```

The theme centralizes:

- business name
- logo placeholder path
- phone/email/website
- address lines
- terms
- signature labels
- document color tokens
- supported copy labels

The formatter layer centralizes:

- INR currency display
- Indian date/date-time display
- safe text fallbacks
- invoice title by tax mode
- normalized document status display
- unsafe status labels
- unsafe status watermark mapping
- unsafe status warning messages
- positive amount checks for outstanding/balance visibility

Current shared unsafe statuses:

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

## Dashboard-shell isolation

Print routes are routed outside the operational dashboard chrome by:

```text
frontend/src/components/layout/AdminShellRouter.tsx
frontend/src/app/(dashboard)/admin/layout.tsx
```

`AdminShellRouter` keeps `RoleGuard` active for admin-only access, but bypasses `DashboardShell` for routes ending in:

```text
/print
/contract/print
```

This prevents sidebar, topbar, command palette triggers, quick-action buttons, workspace menus, and business setup banners from contaminating print document previews or printed output.

## Print CSS rules

`DocumentPage` includes print-safe global CSS for:

- `@page { size: A4; margin: 12mm; }`
- fixed full-screen document preview overlay during screen use
- static A4 document flow during browser print
- print-only document visibility isolation
- toolbar hidden during print
- non-document `header`, `nav`, `aside`, and `data-document-link-strip` hidden during print
- safe print margins
- browser Save as PDF
- avoiding page breaks inside document cards, rows, and signature blocks
- repeating table headers where supported
- readable table headers
- white print background so documents remain readable when browser background graphics are disabled
- light unsafe-status watermark that does not block document text

`PrintToolbar` is fixed above the document preview and hidden in print output.

## Implemented routes and UI entry points

| Document | Print route | Source contract | UI entry point | Route helper |
|---|---|---|---|---|
| Direct Sale Invoice | `/admin/billing/direct-sale/[id]/print` | `GET /billing/direct-sales/:id/` | Direct-sale workspace row action `Invoice PDF` | `buildAdminDirectSalePrintRoute(id)` |
| Payment / EMI Receipt | `/admin/billing/receipts/[id]/print` | `GET /billing/receipts/:id/` | Receipt register row action `Print / Save PDF` | `buildAdminBillingReceiptPrintRoute(id)` |
| Direct Sale Delivery Challan | `/admin/deliveries/direct-sale-cases/[caseId]/print` | `GET /admin/deliveries/direct-sale-cases/:caseId/` | Delivery case detail `Delivery Challan / Print` | `buildAdminDirectSaleDeliveryChallanPrintRoute(id)` |
| Lucky Plan / Subscription Contract | `/admin/subscriptions/[id]/contract/print` | `GET /admin/subscriptions/:id/`, optional `GET /admin/customers/:id/` | Subscription detail `Contract PDF / Print` | `buildAdminSubscriptionContractPrintRoute(id)` |
| Rent / Lease Contract | `/admin/rent-lease/contracts/[id]/contract/print` | `GET /admin/subscriptions/:id/`, optional `GET /admin/customers/:id/`, optional `GET /admin/contracts/:id/possession/` | Subscription detail `Rent / Lease Contract PDF / Print` only when `plan_type` is `RENT` or `LEASE` and matching profile exists | `buildAdminRentLeaseContractPrintRoute(id)` |

## Document-specific safety notes

### Direct Sale Invoice

The direct-sale invoice print route uses existing direct-sale payload fields only:

- invoice/sale references
- customer snapshot
- line items
- totals
- received amount
- balance due
- invoice/payment status

Outstanding balance is visible when backend payload reports it. The print page does not post payments, update invoice state, create receipts, move stock, or alter delivery readiness.

### Payment / EMI Receipt

The receipt print route uses existing receipt payload fields only:

- receipt number
- receipt type
- receipt status
- source reference
- customer snapshot
- amount paid
- finance account/payment method where exposed
- balance-after-payment where exposed

Unsafe receipt statuses render a visible warning and watermark. Voided, cancelled, or reversed receipts are preserved as audit records and must not be treated as proof of active payment.

### Direct Sale Delivery Challan

The delivery challan print route uses existing normalized `DeliveryRecord` fields only:

- delivery reference
- service desk case number
- source type
- source reference
- invoice reference
- sale reference
- customer name and phone
- receiver name and phone
- delivery address snapshot
- product name and product code
- delivery status and delivery gate
- payment gate
- scheduled date
- delivered date
- notes / operational remarks
- outstanding balance where provided
- payment-exception approval metadata where provided

For payment-exception release cases, the document explicitly states:

```text
Delivery was operationally released.
Receivable remains collectible.
Approval does not settle payment.
```

The delivery challan must not schedule, dispatch, cancel, create notes, move stock, mark delivered, or approve payment exceptions.

### Lucky Plan / Subscription Contract

The subscription contract print page uses existing admin subscription/customer payload fields only:

- subscription reference / `subscription_number` fallback
- customer name, phone, address, city, and email where available
- product name and product code
- product base price / contract price
- tenure months
- monthly EMI amount
- batch code and batch status
- lucky number
- subscription status
- start date / created date
- backend financial summary paid, waived, pending, remaining, and outstanding amounts where available
- backend winner status, winner month, lucky number, waiver scope, waived count, and waived amount where available
- fulfillment and delivery display fields where available
- customer obligations
- business obligations
- cancellation, return, and service note as a terms/control statement
- authorized signatory and customer signature blocks
- audit footer

The page does **not** build an EMI schedule. It does **not** calculate EMI from product price. It prints backend-provided `total_amount`, `monthly_amount`, `tenure_months`, `financial_summary`, and winner/waiver fields only.

Lucky winner and waiver notes are display-only. Winner benefit, where applicable, waives only future eligible EMI rows as recorded by backend winner and waiver records.

### Rent / Lease Contract

The rent/lease contract route is subscription-backed. The `[id]` is the existing subscription id because current backend rent/lease contracts are stored as `Subscription` with `plan_type=RENT` or `plan_type=LEASE` plus an attached `rent_profile` or `lease_profile`.

The rent/lease contract print page uses existing subscription, rent/lease profile, customer, financial summary, and optional possession payload fields only:

- contract reference, using backend `contract_reference` or `subscription_number` when exposed, otherwise a safe subscription fallback
- contract type: Rent or Lease
- customer name, phone, address, city, and email where available
- asset/product name and code
- asset serial/identifier when possession exposes `serial_number`
- contract start date
- tenure months
- monthly rent/lease amount from backend `monthly_amount`
- refundable security deposit
- security deposit amount and percent
- deposit refund status, return condition, deduction amount, and refund amount
- lease buyout amount and ownership-transfer flag where exposed
- branch
- contract status
- delivery/fulfillment/possession status where exposed
- outstanding balance from backend financial summary where exposed
- handover notes and return/damage notes where exposed
- customer obligations
- business obligations
- return/handover condition and damage/deduction note
- authorized signatory and customer signature blocks
- audit footer

The page does **not** generate billing schedules or demand rows. It does **not** calculate monthly rent, lease amount, deposit, refund, deduction, outstanding balance, or due-date rules. Security deposit refund, deduction, withholding, and final refund status must be processed only through backend deposit/refund and return-inspection controls.

## Financial, stock, delivery, and subscription safety rules

All print routes must follow these rules:

1. Print pages are read-only.
2. Browser print is allowed; application data mutation is not.
3. No frontend recalculation of financial truth.
4. No fake totals.
5. No fake tax values.
6. No fake receipt/payment references.
7. No fake EMI schedules.
8. No fake lucky winner, waiver, batch, lucky ID, product, customer, or contract terms.
9. No fake rent/lease monthly billing schedule, deposit, refund, deduction, possession, serial, due-date, or return condition data.
10. Missing optional display values must show a safe fallback such as `—`.
11. Cancelled, failed, voided, returned, reversed, inactive, closed, completed, defaulted, or draft records must not visually appear as normal active/paid records.
12. Outstanding balances must remain visible when the backend payload reports them.
13. Print views must not settle payment, close receivables, post accounting, generate receipts, reconcile items, or mutate operational records.
14. Subscription contract print must not create, update, cancel, close, approve, activate, request return, waive, draw, or mutate subscription/EMI/payment/waiver/lucky ID records.
15. Rent/lease contract print must not create, update, activate, cancel, close, bill, collect, refund, deduct, reconcile, post accounting, change possession, move inventory, or mutate return-inspection records.
16. Delivery challans must not schedule, dispatch, cancel, create notes, move stock, mark delivered, or approve payment exceptions.
17. Delivery must not be displayed as complete unless the backend delivery status/date says it is delivered.
18. Admin outstanding-release approval must be displayed as operational release only; receivable collection remains active.

## Deterministic test coverage

Added / updated:

```text
frontend/tests/e2e/document_print_smoke.spec.ts
frontend/tests/e2e/subscription_contract_print_smoke.spec.ts
frontend/tests/e2e/rent_lease_contract_print_smoke.spec.ts
```

Coverage:

- Direct-sale invoice print route loads with mocked API payload.
- Business name is visible.
- Invoice/sale reference is visible.
- Customer is visible.
- Item table content is visible.
- Grand total, received amount, and balance due are visible.
- Outstanding balance remains visible.
- Print toolbar is visible.
- Dashboard sidebar/topbar/quick-action chrome is absent from print routes.
- Receipt print route loads with mocked API payload.
- Receipt number, customer, source reference, paid amount section, and print toolbar are visible.
- Unsafe receipt status shows visible warning and watermark.
- Direct-sale workspace exposes branded `Invoice PDF` link.
- Direct-sale delivery challan print route loads with mocked API payload.
- Delivery challan route shows business name, delivery title, delivery reference, source reference, customer/receiver, address/status, and print toolbar.
- Payment-exception delivery release says operational release only, receivable remains collectible, and approval does not settle payment.
- Direct-sale delivery detail route exposes `Delivery Challan / Print` link.
- Subscription contract print route loads with mocked API payload.
- Subscription contract route shows business name, contract title, subscription reference, customer, product, product code, EMI/tenure, outstanding balance, signature blocks, and print toolbar.
- Subscription detail route exposes `Contract PDF / Print` link.
- Rent/lease contract print route loads with mocked API payload.
- Rent/lease contract route shows business name, agreement title, contract reference, customer, asset/product, product code, asset serial when exposed, monthly lease/rent amount, security deposit, refundable deposit, outstanding balance, deposit-liability note, signature blocks, and print toolbar.
- Rent/lease subscription detail exposes `Rent / Lease Contract PDF / Print` only when the mocked subscription payload is rent/lease profile-backed.

These tests use mocked frontend API responses and do not depend on live shop data.

## How to wire new document types

For each new document type:

1. Identify the existing backend detail endpoint.
2. Confirm the frontend service/type already exposes the required display fields.
3. Add only additive serializer fields when the backend model already has the display data but the serializer does not expose it.
4. Build the print page using shared document components.
5. Add a row/detail action from the existing operational page.
6. Add deterministic Playwright coverage with mocked API payloads unless a stable fixture already exists.
7. Keep the route read-only.
8. Add unsafe status mapping only through the shared formatter helpers.
9. Keep outstanding balances visible when backend payload reports them.

## Deferred Phase 3 document types

The following templates remain deferred until their existing route/data contracts are confirmed and wired safely:

- Purchase Bill / Vendor Payment Voucher
- Vendor payment voucher / payable settlement document
- Day Close report
- Reconciliation report
- Subscription/rent/lease delivery challans beyond direct-sale delivery cases
- Return inspection customer copy
- Deposit refund advice
