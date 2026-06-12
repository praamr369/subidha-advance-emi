# Phase P12 — Public product detail and enquiry handoff hardening

Scope: product detail page clarity, plan-specific public enquiry links, and safer product-to-apply handoff.

## Implemented

- Added `ProductEnquiryHandoffPanel` for product detail pages.
- Added plan-specific public enquiry links for:
  - Lucky Plan EMI
  - Rent
  - Lease
  - Direct sale
  - Not sure / generic enquiry
- Added `buildProductEnquiryHref()` to centralize product-to-apply query parameters.
- Added `ProductDetailWorkflowBoundary` to explain catalogue, branch confirmation, and controlled-record boundaries.
- Updated `/products/[id]` to use the new handoff panel and workflow boundary.
- Updated `/apply` to honor incoming `plan_interest` or `plan` query values.
- Added handoff source capture into existing public lead notes without changing the public lead API contract.

## Safety contract

Product detail pages may:

- show published product details
- show public product media
- pass product context to `/apply`
- preselect customer plan interest on `/apply`
- guide customers to contact or enquiry routes

Product detail pages must not:

- reserve stock
- lock final price
- approve EMI/rent/lease/direct sale terms
- create customer records automatically
- create subscriptions, Lucky IDs, EMI schedules, deposits, invoices, receipts, delivery records, accounting, reconciliation, commission, or payout records

## API contract

No API contract changes.

`/apply` continues to call the existing public lead endpoint. Product and plan context are carried through existing fields and `notes` only.

## Required checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run build:smoke
```

Manual routes to inspect:

```text
/products
/products/<published-product-id>
/apply?product=<id>&product_name=<name>&product_code=<code>&price=<price>&plan_interest=LUCKY_PLAN&source=product_detail
/apply?product=<id>&plan_interest=RENT&source=product_detail
/apply?product=<id>&plan_interest=LEASE&source=product_detail
/apply?product=<id>&plan_interest=DIRECT_SALE&source=product_detail
```
