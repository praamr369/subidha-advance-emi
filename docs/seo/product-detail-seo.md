# Product Detail SEO (SEO-3)

Public product **detail** pages already existed at `/products/[id]` (SEO-1/2
era). SEO-3 adds structured data and sitemap coverage — no new route, no new
product schema field, no exposure of internal data.

## What SEO-3 added

- **Product JSON-LD** on `/products/[id]` (`buildProductJsonLd`): name, url,
  brand (Subidha Furniture), description, image, category, sku (product_code),
  and an `Offer` (INR price) **only when a valid public price exists**.
- **Deliberately omitted:** `review`, `aggregateRating`, and stock
  `availability` — there is no verified review system, and internal stock must
  not be exposed. No fake ratings, reviews, or availability.
- **Dynamic sitemap:** every public product detail URL (`/products/{id}`) is now
  in `sitemap.xml`, sourced from the existing public products API (active
  finished goods only). On any API failure the sitemap falls back to static
  routes, so the build never breaks.

## Public-safe fields on the detail page / JSON-LD

`name`, `description`, `image`, `category`, `product_code` (as sku),
`base_price` (already public on `/products`).

## Private fields intentionally excluded

purchase/cost price, supplier/vendor, margin, internal stock qty, stock
valuation, accounting mappings, internal notes, and any customer/subscription/
EMI/payment/delivery data. Verified in rendered HTML.

## Canonical URL

Detail pages remain at `/products/[id]` (backward-compatible with any already
indexed URLs). Canonical is set via `buildPublicMetadata`.

## Status vs the task's optional `/products/[categorySlug]/[productSlug]`

Not implemented. Reason: products have **no public slug field**, and adding one
plus a nested detail route would duplicate the existing, working `/products/[id]`
page and risk splitting link equity across two URLs for the same product. The
existing numeric-id detail page is canonical and now fully structured. A future
pass could add an additive nullable `Product.slug` and 301 `/products/[id]` →
the slug URL if pretty product URLs are desired — see "Future" below.

## Future (optional, additive)

- `Product.slug` (nullable) + canonical redirect for human-readable product URLs.
- `Product.show_price_publicly` (default true to preserve current behavior) to
  let admins hide price per product.
- Populate `ProductCategoryMaster.public_title/seo_title/seo_description/
  public_image/sort_order` (already in the model + admin API) for richer
  category pages.

## Safety impact

No EMI, payment, lucky-draw, waiver, commission, payout, accounting,
reconciliation, receipt, invoice, stock-ledger, or audit workflow changed. No
private data exposed. No fake schema. Sitemap change is read-only and
failure-safe.
