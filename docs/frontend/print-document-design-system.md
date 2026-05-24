# Subidha Print Document Design System

Status: **PHASE 2A IMPLEMENTED ON `update` BRANCH**

This document records the branded print/PDF document system for SUBIDHA CORE. The system is intentionally read-only and payload-driven: printable pages display backend-provided business records and never mutate financial, stock, delivery-state, or accounting records.

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

## Financial, stock, and delivery safety rules

All print routes must follow these rules:

1. Print pages are read-only.
2. Browser print is allowed; application data mutation is not.
3. No frontend recalculation of financial truth.
4. No fake totals.
5. No fake tax values.
6. No fake receipt/payment references.
7. Missing optional display values must show a safe fallback such as `—`.
8. Cancelled, failed, voided, returned, reversed, or draft records must not visually appear as normal active/paid records.
9. Outstanding balances must remain visible when the backend payload reports them.
10. Print views must not settle payment, close receivables, post accounting, generate receipts, reconcile items, or mutate operational records.
11. Delivery challans must not schedule, dispatch, cancel, create notes, move stock, mark delivered, or approve payment exceptions.
12. Delivery must not be displayed as complete unless the backend delivery status/date says it is delivered.
13. Admin outstanding-release approval must be displayed as operational release only; receivable collection remains active.

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

Receipt print also shows an explicit warning when a receipt status is voided/cancelled/reversed.

## Deterministic test coverage

Added / updated:

```text
frontend/tests/e2e/document_print_smoke.spec.ts
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

- Subscription / Lucky Plan Contract
- Rent/Lease Contract
- Purchase Bill / Vendor Payment Voucher
- Day Close report
- Reconciliation report

## Delivery document gaps deferred

Current Delivery Challan is wired for direct-sale service desk delivery cases only. Subscription, rent, and lease delivery challans remain deferred until their route convention and detail contracts are selected for the same branded document system.
