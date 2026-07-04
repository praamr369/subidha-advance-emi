# Product Category SEO (SEO-2)

Public, data-driven furniture category pages for local search, built on the
**existing** public products API. No backend migration, no new endpoint, no
exposure of internal ERP/inventory/accounting data.

## Data source

- **API:** existing `GET /api/v1/public/products/` (frontend `listPublicProducts()`).
- This endpoint was already hardened in a prior pass to return **finished goods
  only** — it excludes `RAW_MATERIAL` and `ACCESSORY` inventory profiles, and
  inactive/discontinued products are not served.
- Serializer `PublicProductSerializer` exposes only: `id`, `product_code`,
  `name`, `base_price`, `category`, `subcategory`, `image`, `description`.

Priority order followed (per task): a safe public product API already existed
(option 1), so no new API and no schema change were added.

## Public-safe fields exposed on category pages

`name`, `base_price` (already public on `/products`), `category`, `image`,
and a static "Visit showroom for latest availability" note.

## Private fields intentionally excluded

Never rendered or fetched: purchase/cost price, supplier/vendor, margin,
internal stock quantity, stock valuation, accounting mappings, internal notes,
batch/lucky-ID/subscription/customer/payment/delivery data. Verified by scanning
rendered HTML — none present.

## Category slug map (curated → matched against free-form DB `category`)

The backend has **no category slug and no public-visibility field**;
`Product.category` is a free-form string. Each SEO slug matches products whose
category/subcategory/name contains any of its terms (`lib/product-category-seo.ts`).

| Public URL | Slug | Match terms |
|---|---|---|
| `/products/beds` | beds | bed, cot, diwan |
| `/products/sofas` | sofas | sofa, couch, settee, recliner |
| `/products/wardrobes` | wardrobes | wardrobe, almirah, cupboard, cabinet |
| `/products/dining-tables` | dining-tables | dining, dinner table |
| `/products/mattresses` | mattresses | mattress, matress |
| `/products/appliances` | appliances | appliance, refrigerator, fridge, washing machine, television, tv, cooler, microwave |

**Slug mismatch handling:** because real category strings are admin-entered and
may not equal these slugs, pages match by term, not exact slug. If a category
has no matching products, the page renders a safe empty state
("collection is being updated — visit our showroom") — never a fake product.

## Routing

Static folders (`/products/beds/…`) take precedence over the existing dynamic
`/products/[id]` detail route in Next.js, so there is **no collision** and the
`/products/[id]` product-detail URLs remain unchanged and backward-compatible.

## Sitemap

`frontend/src/app/sitemap.ts` adds the six category URLs (priority 0.85). The
list is static (no build-time API dependency), so a backend outage cannot break
the build or the sitemap.

## Structured data

- Category pages: `BreadcrumbList` (via shell), `ItemList` (only when real
  products matched), `FAQPage` (matching the visible FAQ).
- `/products` index: `ItemList` of the six categories + `FAQPage`.
- No `aggregateRating`, `review`, or `Offer` price schema (no verified review
  system; prices shown as plain text, not schema offers).

## Metadata

Every page uses `buildPublicMetadata()` → title, description, canonical,
OpenGraph, Twitter, robots index+follow. Titles follow "Beds in Asansol |
Subidha Furniture" style.

## SEO-3 recommendations (future, not built)

- Dedicated public product **detail** pages at a slug (`/products/{category}/{slug}`)
  require adding an additive nullable `slug` (+ optional `is_public`,
  `public_short_description`) to `Product`, plus a public detail endpoint. Not
  done here to keep this pass migration-free.
- Optional additive category model fields (`slug`, `is_public`, `seo_title`,
  `seo_description`, `sort_order`) would let the six pages be admin-managed
  instead of code-configured.

## Owner / admin tasks

- Keep product `category` values consistent (e.g. "Bed", "Sofa Set", "Wardrobe")
  so term-matching captures them on the right category page.
- Upload product images and fill `description` in the admin product editor —
  cards show image + name; missing images fall back to a clean placeholder.

## Risk notes

- Term-matching is heuristic; an unusually named product may land on `/products`
  but not a category page. This is safe (never wrong data, just fewer cards).
- Prices are live from `base_price`. If the business decides prices should not be
  public, add a `show_price_publicly` flag (SEO-3) and hide the price line.

## Safety impact

No EMI, payment, lucky-draw, waiver, commission, payout, accounting,
reconciliation, or stock-ledger logic changed. No customer/payment/subscription
data exposed. No cost/supplier/margin/valuation exposed. No fake products,
prices, ratings, or availability. No migration. All changes are frontend + docs,
Git-traceable.
