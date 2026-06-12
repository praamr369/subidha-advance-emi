# Phase P14 — Public SEO, social metadata, and structured-data hardening

Scope: public frontend metadata consistency, social preview defaults, canonical handling, robots policy, and JSON-LD structured data.

## Implemented

- Hardened `buildPublicMetadata()`:
  - normalized `NEXT_PUBLIC_SITE_URL`
  - added `metadataBase`
  - added canonical path handling
  - added robots / Googlebot directives
  - added OpenGraph social image support
  - added Twitter `summary_large_image` support
  - uses generated `hero-3d-showroom.webp` as default social preview image when available
- Added safe absolute URL helper:
  - preserves already-absolute URLs
  - prefixes local public assets with the configured public site URL
- Added global structured data:
  - `FurnitureStore`
  - `WebSite`
  - search action for public product search
  - profile-aware logo, phone, email, address, and social links where available
- Centralized global JSON-LD in the public layout through `PublicStructuredData`.
- Removed duplicate home-only structured-data script.
- Added breadcrumb JSON-LD through `PublicPageShell` using existing breadcrumb props.
- Updated product detail metadata to use the shared public metadata helper and product image where available.
- Updated public Playwright smoke coverage to assert social metadata and global structured data.

## Safety contract

P14 is public frontend-only.

It must not:

- change backend APIs
- change public lead payload contract
- alter products, customers, subscriptions, Lucky IDs, EMIs, rent/lease records, deposits, payments, receipts, invoices, delivery records, accounting, reconciliation, commission, or payout records
- expose private customer data in metadata or structured data
- invent registration numbers, GST numbers, legal identifiers, review ratings, or stock availability

## Required checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run build:smoke
npx playwright test tests/e2e/public.spec.ts --project=chromium
```

Manual metadata checks:

```text
/
/products
/products/<published-product-id>
/apply
/contact
/policies
/winners
/lucky-plan/fair-draw
```

Inspect in browser devtools:

- `meta[property="og:image"]`
- `meta[name="twitter:card"]`
- `script#public-global-structured-data`
- breadcrumb `application/ld+json` script on pages with breadcrumbs

Deployment note:

Set `NEXT_PUBLIC_SITE_URL` to the real production origin before production build. Do not leave the fallback example URL in production.
