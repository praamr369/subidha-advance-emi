# Phase P16 — Public final release-readiness audit and deployment checklist

Scope: public frontend release checks for the marketing/public site after P7–P15.

## Implemented

- Added `frontend/scripts/check-public-release-readiness.mjs`.
- Added npm script:

```bash
npm run check:public-release
```

The checker validates:

- required generated WebP marketing files exist under `frontend/public/marketing/generated/`
- public marketing asset manifest points to the generated files
- generated public assets are enabled through `imageExists: true`
- public SEO helper exists and contains site URL, OpenGraph, Twitter, `FurnitureStore`, and breadcrumb JSON-LD support
- global public structured-data component exists
- public layout emits global structured data
- public layout keeps skip-link support
- public Playwright smoke covers mobile navigation, route smoke, metadata, and image performance markers
- required public P11–P15 phase documents exist
- `NEXT_PUBLIC_SITE_URL` is set to a production-safe HTTPS origin before release build, warning if absent

## Release gate order

Run from the frontend directory:

```bash
cd frontend
npm run check:public-release
npm run check:routes
npm run lint
npm run typecheck
npm run build:smoke
npx playwright test tests/e2e/public.spec.ts --project=chromium
```

Recommended full frontend release gate:

```bash
cd frontend
NEXT_PUBLIC_SITE_URL=https://subidhafurnitureasansol.com npm run check:public-release
npm run validate
npm run test:e2e:release-smoke
npx playwright test tests/e2e/public.spec.ts --project=chromium
```

## Manual public route checklist

Inspect on desktop and mobile widths:

```text
/
/products
/products/<published-product-id>
/apply
/contact
/policies
/winners
/winner-history
/lucky-plan
/lucky-plan/fair-draw
/lucky-plan/fair-draw/<published-draw-id>
/rent
/lease
/direct-sale
```

## Manual browser checks

- No horizontal overflow on mobile.
- Mobile navigation opens, closes, and navigates safely.
- Footer links are tappable.
- Generated marketing images load from `/marketing/generated/*.webp`.
- Hero images do not create large layout shift.
- Product list/card images lazy-load below the hero area.
- `meta[property="og:image"]` resolves to a production URL.
- `meta[name="twitter:card"]` is `summary_large_image`.
- `script#public-global-structured-data` is present once.
- Pages using `PublicPageShell` include breadcrumb JSON-LD.
- Public enquiry form submits to the existing public lead endpoint only.

## Deployment environment checklist

Before production build:

```bash
NEXT_PUBLIC_SITE_URL=https://subidhafurnitureasansol.com
NEXT_PUBLIC_API_BASE_URL=https://subidhafurnitureasansol.com/api/v1
```

Do not leave public production builds with:

```text
https://subidha.example.com
http://localhost:3000
http://127.0.0.1:3000
```

## Safety contract

P16 is public frontend/release tooling only.

It must not:

- change backend APIs
- change database schema
- change public lead payload contract
- create or mutate customers, products, subscriptions, Lucky IDs, EMIs, rent/lease records, deposits, payments, receipts, invoices, delivery records, accounting, reconciliation, commission, payout, or draw records
- alter pricing, stock, approval, winner selection, waiver, payment posting, receipt generation, accounting bridge, or reconciliation logic

## Release decision classification

### Release can proceed when

- `npm run check:public-release` passes
- `npm run lint` passes
- `npm run typecheck` passes
- `npm run build:smoke` passes
- public Playwright smoke passes
- production environment variables are set
- public routes have been manually checked on mobile and desktop

### Release must pause when

- generated assets are missing while `imageExists: true`
- public route smoke fails
- build uses fallback `https://subidha.example.com`
- public enquiry form creates anything beyond a lead
- public pages expose private customer/contact/KYC/ledger data
- any public action appears to create payment, invoice, receipt, subscription, Lucky ID, rent/lease deposit, waiver, delivery, accounting, reconciliation, commission, payout, or draw execution records
