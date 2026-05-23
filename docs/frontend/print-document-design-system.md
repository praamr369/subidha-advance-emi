# Subidha Print Document Design System

Status: **PARTIAL FRONTEND ROLLOUT ON `update` BRANCH**

This pass introduces a branded, reusable print/PDF document design system for SUBIDHA CORE.

## Scope implemented

### Shared frontend document primitives

Added reusable components under:

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

### Shared document theme and formatters

Added:

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

### Print CSS

`DocumentPage` includes print-safe global CSS for:

- A4 page size
- safe print margins
- print-only document visibility
- browser Save as PDF
- avoiding page breaks inside document cards/rows/signature blocks
- repeating table headers where supported
- hiding the toolbar during print

## Document route implemented

### Direct Sale Invoice

Implemented route:

```text
/admin/billing/direct-sale/[id]/print
```

Source data:

```text
GET /billing/direct-sales/:id/
```

Frontend service:

```text
frontend/src/services/billing.ts#getDirectSale
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

## Financial safety

This design system is read-only.

It does not change:

- financial calculations
- payment posting
- invoice balance calculation
- receipt generation
- EMI logic
- accounting
- reconciliation
- lucky draw
- commission/payout
- waiver logic
- receivable logic

No frontend totals are treated as financial truth. The direct-sale invoice print page displays values from the backend payload.

## Status/watermark behavior

The print shell supports status watermarks for:

- `CANCELLED`
- `VOID`
- `VOIDED`
- `DRAFT`
- `RETURNED`
- `REVERSED`

These prevent cancelled/voided/draft/returned documents from visually appearing as normal paid documents.

## Deferred document types

The following templates should be wired only after confirming existing routes/data contracts:

- Payment Receipt
- EMI Receipt
- Delivery Challan
- Lucky Plan / Subscription Contract
- Rent/Lease Contract
- Purchase Bill / Vendor Payment Voucher
- Day Close report
- Reconciliation report

Do not invent fake document routes or fake API fields for these. Reuse the shared components once the existing payload contracts are identified.

## Suggested next phase

Phase: **Receipt and Delivery Print Route Wiring**

Goal:

- locate existing receipt detail route/data contract
- add receipt print page using `ReceiptDocument`
- locate direct-sale delivery case detail contract
- add delivery challan print page using `DeliveryRecord`
- add Playwright smoke coverage for direct-sale invoice and receipt/challan print pages

Risk level: Low, if kept read-only and payload-driven.
