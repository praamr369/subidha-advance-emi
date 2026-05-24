# Subidha Print Document Design System

Status: **PHASE 2C IMPLEMENTED ON `update` BRANCH**

This document records the branded print/PDF document system for SUBIDHA CORE. The system is intentionally read-only and payload-driven: printable pages display backend-provided business records and never mutate financial, stock, delivery-state, subscription-state, EMI, waiver, lucky draw, reconciliation, rent/lease deposit, billing, refund, possession, return-inspection, or accounting records.

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
- status watermark mapping
- invoice title by tax mode

## Print CSS rules

`DocumentPage` includes print-safe global CSS for:

- A4 page size
- safe print margins
- print-only document visibility
- browser Save as PDF
- avoiding page breaks inside document cards, rows, and signature blocks
- repeating table headers where supported
- hiding the toolbar during print

## Implemented routes

### Direct Sale Invoice

Route:

```text
/admin/billing/direct-sale/[id]/print
```

Source contract:

```text
GET /billing/direct-sales/:id/
```

Frontend service:

```text
frontend/src/services/billing.ts#getDirectSale
```

Route helper:

```text
buildAdminDirectSalePrintRoute(id)
```

Operational wiring:

```text
frontend/src/app/(dashboard)/admin/billing/direct-sale/DirectSaleWorkspace.tsx
```

The direct-sale workspace invoice column exposes `Invoice PDF`, which opens the branded print route without changing direct-sale operations.

### Payment Receipt / EMI Receipt

Route:

```text
/admin/billing/receipts/[id]/print
```

Source contract:

```text
GET /billing/receipts/:id/
```

Route helper:

```text
buildAdminBillingReceiptPrintRoute(id)
```

Operational wiring:

```text
frontend/src/app/(dashboard)/admin/billing/receipts/page.tsx
```

The receipt register exposes a row-level `Print / Save PDF` action that opens the branded receipt print route.

### Direct Sale Delivery Challan

Route:

```text
/admin/deliveries/direct-sale-cases/[caseId]/print
```

Source contract:

```text
GET /admin/deliveries/direct-sale-cases/:caseId/
```

Frontend service:

```text
frontend/src/services/deliveries.ts#getAdminDirectSaleDeliveryCase
```

Route helper:

```text
buildAdminDirectSaleDeliveryChallanPrintRoute(id)
```

Operational wiring:

```text
frontend/src/app/(dashboard)/admin/deliveries/direct-sale-cases/[caseId]/layout.tsx
```

The direct-sale delivery case route displays `Delivery Challan / Print` above the operational detail page. This keeps the print affordance visible without changing schedule, dispatch, cancellation, payment-release, stock, mark-delivered, or note actions.

The delivery challan print page uses existing normalized `DeliveryRecord` fields only:

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

### Lucky Plan / Subscription Contract

Route:

```text
/admin/subscriptions/[id]/contract/print
```

Source contracts:

```text
GET /admin/subscriptions/:id/
GET /admin/customers/:id/
```

The customer detail call is display-only and is used only when the subscription payload exposes a customer id. It provides already-existing customer address/email display data. If that request fails, the print page still renders the subscription contract with safe fallbacks.

Route helper:

```text
buildAdminSubscriptionContractPrintRoute(id)
```

Operational wiring:

```text
frontend/src/app/(dashboard)/admin/subscriptions/[id]/layout.tsx
```

Print route:

```text
frontend/src/app/(dashboard)/admin/subscriptions/[id]/contract/print/page.tsx
```

The subscription detail route displays `Contract PDF / Print` above the operational subscription detail page. The action is isolated in the `[id]` layout and hidden for nested print routes, so it does not disturb subscription transition buttons, cancellation actions, payment views, delivery actions, timeline sections, or document upload flows.

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

### Rent / Lease Contract

Route:

```text
/admin/rent-lease/contracts/[id]/contract/print
```

The `[id]` is the existing subscription id because the current backend stores rent/lease contracts as subscription-backed records with `plan_type=RENT` or `plan_type=LEASE` plus an attached `rent_profile` or `lease_profile`.

Source contracts:

```text
GET /admin/subscriptions/:id/
GET /admin/customers/:id/
GET /admin/contracts/:id/possession/
```

The customer and possession calls are display-only. The possession call is optional and is used only for already-existing serial, handover, expected return, actual return, and condition-note fields. If either optional request fails, the print page renders with safe fallbacks.

Route helper:

```text
buildAdminRentLeaseContractPrintRoute(id)
```

Operational wiring:

```text
frontend/src/app/(dashboard)/admin/subscriptions/[id]/layout.tsx
```

Print route:

```text
frontend/src/app/(dashboard)/admin/rent-lease/contracts/[id]/contract/print/page.tsx
```

The subscription detail layout exposes `Rent / Lease Contract PDF / Print` only when the existing detail payload confirms a rent/lease plan and matching `rent_profile` or `lease_profile`. Nested print routes still return children only, so the operational strip does not contaminate print output.

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

The page does **not** generate billing schedules or demand rows. It does **not** calculate monthly rent, lease amount, deposit, refund, deduction, outstanding balance, or due-date rules. Missing optional values render as `—`.

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
11. Cancelled, failed, voided, returned, reversed, inactive, closed, completed, or draft records must not visually appear as normal active/paid records.
12. Outstanding balances must remain visible when the backend payload reports them.
13. Print views must not settle payment, close receivables, post accounting, generate receipts, reconcile items, or mutate operational records.
14. Subscription contract print must not create, update, cancel, close, approve, activate, request return, waive, draw, or mutate subscription/EMI/payment/waiver/lucky ID records.
15. Rent/lease contract print must not create, update, activate, cancel, close, bill, collect, refund, deduct, reconcile, post accounting, change possession, move inventory, or mutate return-inspection records.
16. Delivery challans must not schedule, dispatch, cancel, create notes, move stock, mark delivered, or approve payment exceptions.
17. Delivery must not be displayed as complete unless the backend delivery status/date says it is delivered.
18. Admin outstanding-release approval must be displayed as operational release only; receivable collection remains active.

## Status/watermark behavior

The print shell supports status watermarks for:

- `CANCELLED`
- `VOID`
- `VOIDED`
- `DRAFT`
- `RETURNED`
- `REVERSED`

Delivery Challan also maps these unsafe delivery states to watermarks:

- `FAILED`
- `CANCELLED`
- `RETURNED`
- `REVERSED`

Subscription Contract and Rent / Lease Contract also map these non-active contract states to watermarks:

- `CLOSED`
- `COMPLETED`
- `DEFAULTED`
- `INACTIVE`
- `RETURNED`

Receipt print also shows an explicit warning when a receipt status is voided/cancelled/reversed.

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
- Print toolbar is visible.
- Receipt print route loads with mocked API payload.
- Receipt number, customer, source reference, paid amount section, and print toolbar are visible.
- Direct-sale workspace exposes branded `Invoice PDF` link.
- Direct-sale delivery challan print route loads with mocked API payload.
- Delivery challan route shows business name, delivery title, delivery reference, source reference, customer/receiver, address/status, and print toolbar.
- Direct-sale delivery detail route exposes `Delivery Challan / Print` link.
- Subscription contract print route loads with mocked API payload.
- Subscription contract route shows business name, contract title, subscription reference, customer, product, product code, EMI/tenure, signature blocks, and print toolbar.
- Subscription detail route exposes `Contract PDF / Print` link.
- Rent/lease contract print route loads with mocked API payload.
- Rent/lease contract route shows business name, agreement title, contract reference, customer, asset/product, product code, asset serial when exposed, monthly lease/rent amount, security deposit, refundable deposit, signature blocks, and print toolbar.
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

## Deferred document types

The following templates remain deferred until their existing route/data contracts are confirmed and wired safely:

- Purchase Bill / Vendor Payment Voucher
- Day Close report
- Reconciliation report

## Delivery document gaps deferred

Current Delivery Challan is wired for direct-sale service desk delivery cases only. Subscription, rent, and lease delivery challans remain deferred until their route convention and detail contracts are selected for the same branded document system.
