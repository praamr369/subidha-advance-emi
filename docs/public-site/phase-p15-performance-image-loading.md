# Phase P15 — Public performance, image loading, and Core Web Vitals hardening

Scope: public frontend image loading behavior, layout stability, carousel paint containment, and smoke coverage.

## Implemented

- Hardened generated marketing image loading:
  - explicit `sizes`
  - explicit quality default
  - `priority` only for above-the-fold hero visuals
  - `loading="lazy"` only for non-priority images
  - stable `data-public-image` marker for smoke tests
  - paint containment on image cards
- Hardened public hero banner images:
  - explicit quality
  - configurable `imageSizes`
  - no `priority` / `loading="eager"` conflict
  - paint containment on hero banners
- Hardened public product media:
  - explicit lazy loading for non-primary product images
  - product detail primary image can stay priority
  - lower quality for carousel/list images
  - stable `data-public-image` marker
  - paint containment on product media wrappers
- Hardened public product detail gallery:
  - first product media is primary
  - non-primary gallery slides use lower quality and lazy loading
- Hardened featured products:
  - featured product images stay lazy
  - quality lowered for below-the-fold cards
  - card paint containment added
- Hardened public carousel rendering:
  - paint containment added
  - no hidden focusable slide content
- Prioritized visible generated hero assets for:
  - Home
  - Apply
  - Contact
  - Products catalogue
  - Policies
  - Rent / Lease
  - Winners / winner history / Fair Draw
- Added Playwright smoke assertion for public image performance markers.

## Safety contract

P15 is public frontend-only.

It must not:

- change backend APIs
- change public lead payload contract
- change product records, customers, subscriptions, Lucky IDs, EMIs, rent/lease records, deposits, payments, receipts, invoices, delivery records, accounting, reconciliation, commission, payout, or draw records
- alter pricing, stock, plan approval, winner selection, or waiver logic

## Notes

One Lucky Plan hero file was not modified because the connector blocked the full-file write due to sensitive financial/draw wording already present in the file. Other public hero/image paths were hardened, and the shared generated image component still benefits that file with safer default lazy/priority handling.

## Required checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run build:smoke
npx playwright test tests/e2e/public.spec.ts --project=chromium
```

Manual Core Web Vitals inspection:

```text
/
/products
/products/<published-product-id>
/apply
/contact
/policies
/winners
/winner-history
/lucky-plan/fair-draw
/rent
/lease
```

Inspect in browser devtools:

- Hero image request priority on first viewport pages
- Non-hero product/card images lazy loading
- No horizontal layout shift after images load
- No duplicate large image downloads on carousel pages
- `data-public-image="generated"` or `data-public-image="product"` markers
