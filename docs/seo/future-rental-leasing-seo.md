# Future Rental / Leasing SEO Plan (not yet implemented)

The business currently leads with furniture sales, EMI, and Lucky Plan EMI. Rent
and lease exist as contract types in the system, but dedicated **local SEO
landing pages** for them are intentionally not built yet. This note keeps the
door open without breaking current Lucky Plan URLs.

## Future URL plan (additive — no collisions)

| Future URL | Purpose | Target keywords |
|---|---|---|
| `/furniture-rental-asansol` | Rental landing | furniture on rent in Asansol; rent furniture near me |
| `/furniture-lease-asansol` | Lease landing | furniture lease in Asansol; office furniture lease |
| `/products/{category}` | Category index (shared with sales) | category + Asansol |
| `/products/{category}/{slug}` | Product detail (shared) | model-specific |

These do not overlap with existing routes (`/lucky-plan-emi-furniture-asansol`,
`/furniture-store-asansol`, `/delivery-asansol`, `/rent`, `/lease`), so adding
them later will not break current Lucky Plan SEO or redirects.

## Schema plan

- Reuse `buildOrganizationJsonLd()` (FurnitureStore) globally.
- Reuse `buildFaqJsonLd()` and `buildBreadcrumbJsonLd()` per page.
- For rental offerings, consider `Product` + `Offer` with `businessFunction:
  http://purl.org/goodrelations/v1#LeaseOut` **only if** real, truthful pricing/
  terms are public. Do not fabricate prices.

## Content plan

- Reuse the `LocalSeoLanding` component (already built) for consistency.
- Keep **rent/lease terms separate from EMI/Lucky Plan terms**. Link each rental/
  lease page to its own policy (`/rental-lease-policy`), never to Lucky Plan terms,
  to avoid mixing obligations.
- Truthful copy only: availability, deposit, and charges "as per approved terms";
  no guaranteed pricing or availability claims.

## How to avoid breaking current Lucky Plan SEO

- Do not rename or redirect existing Lucky Plan URLs when adding rental/lease pages.
- Add new rows to `sitemap.ts`; do not remove existing ones.
- Keep robots rules unchanged (rental/lease pages are public, index+follow).
- Keep Lucky Plan and rental/lease FAQs on their own pages so FAQ JSON-LD stays
  page-specific.

## Trigger to implement

Only build these when the business decides to actively market rent/lease locally.
At that point: create the two landing pages with `LocalSeoLanding`, wire the
category route decision from `local-seo-audit.md`, and add all new URLs to the
sitemap.
