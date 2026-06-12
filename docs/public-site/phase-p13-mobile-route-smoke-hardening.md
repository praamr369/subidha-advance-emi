# Phase P13 — Public mobile and route smoke hardening

Scope: public frontend mobile polish, navigation accessibility, footer tap targets, and Playwright route smoke coverage.

## Implemented

- Hardened public mobile navigation:
  - explicit `aria-expanded`
  - explicit `aria-controls`
  - `aria-current="page"` on active links
  - larger mobile menu button target
  - scroll-contained mobile menu
  - larger mobile link tap targets
- Hardened public footer:
  - larger quick-link tap targets
  - focus-visible rings
  - better mobile grid behavior
  - break-word contact rows for long email/address values
  - dark-mode-safe footer surfaces
- Updated public Playwright smoke coverage:
  - mobile nav open/close behavior
  - route smoke set for key public pages
  - product detail current copy and handoff panel
  - product-to-apply plan-specific handoff
  - current draw/winner transparency sections

## Safety contract

P13 is frontend public-only.

It must not:

- change backend APIs
- change public lead payload contract
- create or mutate customers, products, subscriptions, Lucky IDs, EMIs, rent/lease records, deposits, invoices, receipts, delivery records, accounting, reconciliation, commission, or payout records
- change draw execution, winner selection, or waiver logic

## Required checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run build:smoke
npx playwright test tests/e2e/public.spec.ts --project=chromium
```

Manual routes to inspect on mobile width and desktop width:

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
/rent
/lease
/direct-sale
```

Mobile manual checks:

- Open menu button announces expanded/collapsed state.
- Mobile menu scrolls inside the viewport.
- Products, Apply, Login, Contact links are reachable.
- Footer links are tappable and do not overflow horizontally.
- Product detail plan buttons prefill `/apply` with `plan_interest`.
