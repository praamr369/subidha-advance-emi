# Subidha Print Document Design System

Status: **PHASE 1B IMPLEMENTED ON `update` BRANCH**

This document records the branded print/PDF document system for SUBIDHA CORE. The system is intentionally read-only and payload-driven: printable pages display backend-provided business records and never mutate financial state.

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

The page uses existing `DirectSale` fields only:

- sale reference
- invoice number where available
- customer snapshots
- branch data
- tax mode
- invoice/payment/status fields
- line items
- subtotal
- discount
- taxable total
- tax total
- grand total
- received amount
- balance due
- finance account
- delivery/customer address snapshots

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

The receipt register now exposes a row-level `Print / Save PDF` action that opens the branded receipt print route.

The receipt print page uses existing `ReceiptDocument` fields and optional display fields when present:

- receipt number
- receipt date
- receipt type
- source type/reference
- direct-sale reference where available
- customer snapshot
- customer phone
- branch/counter
- finance account
- paid amount
- status
- journal reference where available
- notes

Optional payment display fields such as method/reference/collector are displayed only if the API payload exposes them. The print page does not invent these values.

## Financial display safety rules

All print routes must follow these rules:

1. Print pages are read-only.
2. Browser print is allowed; application data mutation is not.
3. No frontend recalculation of financial truth.
4. No fake totals.
5. No fake tax values.
6. No fake receipt/payment references.
7. Missing optional display values must show a safe fallback such as `—`.
8. Cancelled, voided, returned, reversed, or draft records must not visually appear as normal active/paid records.
9. Outstanding balances must remain visible when the backend payload reports them.
10. Print views must not settle payment, close receivables, post accounting, generate receipts, reconcile items, or mutate operational records.

## Status/watermark behavior

The print shell supports status watermarks for:

- `CANCELLED`
- `VOID`
- `VOIDED`
- `DRAFT`
- `RETURNED`
- `REVERSED`

Receipt print also shows an explicit warning when a receipt status is voided/cancelled/reversed.

## Deterministic test coverage

Added:

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

- Delivery Challan
- Lucky Plan / Subscription Contract
- Rent/Lease Contract
- Purchase Bill / Vendor Payment Voucher
- Day Close report
- Reconciliation report

## Notes for the next pass

Direct-sale invoice print has a canonical route helper and deterministic smoke coverage. The next low-risk UI pass should add a dedicated row action inside the large direct-sale workspace action column using:

```text
buildAdminDirectSalePrintRoute(row.id)
```

That change should be made as a small targeted UI patch to avoid disturbing the existing direct-sale operational action logic.
