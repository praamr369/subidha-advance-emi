# Phase P8 — Public readiness pass

Scope: public website accessibility, visual asset activation, and operational-disclosure hardening.

## Implemented

- Added a skip link before public navigation.
- Kept `#main-content` as the public page target through `PublicVisualShell`.
- Added a public operational disclosure strip across public pages.
- Activated generated marketing assets through `frontend/src/lib/public-marketing-assets.ts` after assets were confirmed present locally.
- Tuned generated marketing image loading through `GeneratedMarketingVisual`:
  - manifest-first asset input
  - explicit `sizes`
  - controlled `quality`
  - priority remains opt-in for hero images only

## Safety contract

Public pages may:

- show marketing images
- collect public enquiry leads
- show public product records
- show public policy/disclaimer content
- link to login/contact/product/policy routes

Public pages must not:

- create subscriptions
- assign Lucky IDs
- create EMI schedules
- collect payments
- generate receipts or invoices
- create rent/lease deposit records
- create delivery proof
- create accounting, reconciliation, commission, or payout records

## Required checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run build:smoke
```

Manual routes to inspect:

```text
/
/lucky-plan
/rent
/lease
/products
/apply
/contact
```

## Deployment notes

Ensure these files exist before deploying with `imageExists: true`:

```text
frontend/public/marketing/generated/hero-3d-showroom.webp
frontend/public/marketing/generated/lucky-plan-3d-card.webp
frontend/public/marketing/generated/rent-lease-3d-room.webp
frontend/public/marketing/generated/product-wall-3d.webp
frontend/public/marketing/generated/receipt-contract-3d.webp
frontend/public/marketing/generated/winner-draw-3d.webp
frontend/public/marketing/generated/asansol-family-furniture.webp
frontend/public/marketing/generated/showroom-premium-interior.webp
```
