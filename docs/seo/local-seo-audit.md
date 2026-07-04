# Local SEO Audit — Subidha Furniture public website

Scope: public marketing site only (`frontend/src/app/(public)`). No EMI,
payment, draw, waiver, commission, payout, reconciliation, accounting, stock, or
auth logic was inspected for change or changed. This audit reflects the state at
the time of this pass and the additive improvements made.

## What already existed (strong baseline)

The public site was already well-built for SEO:

- **Route group** `(public)` with ~40 crawlable pages (home, products, lucky-plan,
  about, contact, delivery-policy, faq, rulebook, terms, privacy, winners, etc.).
- **`frontend/src/app/robots.ts`** — allows `/`, disallows `/admin/`, `/cashier/`,
  `/customer/`, `/partner/`, `/vendor/`, `/login`, `/unauthorized`, `/brochures/`,
  `/quotations/`; declares the sitemap URL and host.
- **`frontend/src/app/sitemap.ts`** — static list of public routes with priorities.
- **`frontend/src/lib/public-seo.ts`** — `buildPublicMetadata()` (title, description,
  canonical, robots, OpenGraph, Twitter), `buildOrganizationJsonLd()` (**FurnitureStore**
  schema with `areaServed`), `buildWebsiteJsonLd()` (WebSite + SearchAction),
  `buildBreadcrumbJsonLd()`.
- **`frontend/src/components/public/PublicStructuredData.tsx`** — injects the global
  Organization + WebSite JSON-LD, sourced from the live public business profile.
- **Backend public business profile API** — `GET /api/v1/public/business-profile/`
  (`api/v1/views/public_site.py`) already returns display name, phone, email,
  WhatsApp, address, map URL, business hours, social links, logo. **No backend
  migration was needed.**

## Gaps found

| Area | Status before | Action this pass |
|---|---|---|
| Local-keyword landing pages (`furniture store in Asansol`, `Lucky Plan EMI furniture`, `furniture delivery in Asansol`) | Missing | **Added** 3 pages |
| FAQ structured data helper | Missing | **Added** `buildFaqJsonLd()` |
| ItemList structured data helper (category pages) | Missing | **Added** `buildItemListJsonLd()` |
| New landing pages in sitemap | N/A | **Added** to `sitemap.ts` |
| Product category landing pages (`/products/beds` … `/appliances`) | Not present as dedicated routes | **Documented as owner decision** (see below) |
| aggregateRating / reviews schema | Absent (correct) | **Left absent** — no real review system, must not fake |
| Metadata coverage | Present via `buildPublicMetadata` on most pages | No change needed |
| Robots protection of private areas | Correct | No change needed |

## Fixed in this pass

- `frontend/src/app/(public)/furniture-store-asansol/page.tsx` — local furniture-store landing.
- `frontend/src/app/(public)/lucky-plan-emi-furniture-asansol/page.tsx` — compliance-safe Lucky Plan EMI landing.
- `frontend/src/app/(public)/delivery-asansol/page.tsx` — delivery-area landing.
- `frontend/src/components/public/LocalSeoLanding.tsx` — reusable server component (H1/H2, visible FAQ, JSON-LD, contact CTAs pulled from the live public profile).
- `frontend/src/lib/public-seo.ts` — `buildFaqJsonLd()`, `buildItemListJsonLd()`.
- `frontend/src/app/sitemap.ts` — three new URLs added.

Each new page: exactly one H1 (from `PublicPageShell`), logical H2 sections,
crawlable text (not image-only), FAQ rendered visibly **and** as matching
`FAQPage` JSON-LD, internal links, and truthful copy only. Contact/WhatsApp/phone
come from the configured business profile — nothing is hardcoded or invented.

## Needs owner / manual action

- **Product category landing pages** — **RESOLVED in SEO-2**, hardened in SEO-3.
  Six static category pages exist with safe empty states. SEO-3 added additive
  category SEO fields (`slug`, `is_public`, `public_title`, `seo_*`, `sort_order`),
  a public categories API, product `category_slug`, canonical-slug-preferred
  matching (union with heuristics), Product JSON-LD on `/products/[id]`, and
  dynamic product URLs in the sitemap. See `docs/seo/product-category-seo.md` and
  `docs/seo/product-detail-seo.md`.
- **Admin category SEO form inputs** — backend API supports the new fields;
  the custom React admin category form still needs inputs added (documented
  follow-up).
- **Google Business Profile**: see `docs/seo/google-business-profile-checklist.md`.
- **Local citations / directories**: see `docs/seo/local-citation-checklist.md`.
- **Business profile content**: ensure the admin → Business Setup → Public Site
  form has the real showroom address, phone, WhatsApp, hours, map URL, and socials
  filled in — the new landing pages and JSON-LD read live from it.
- **OG image**: confirm a real branded share image exists at the configured logo/
  hero path so social/link previews look correct.
- **Performance**: run Lighthouse on the three new pages after deploy; they are
  server components with minimal JS, so risk is low.

## Safety impact

- **Existing data:** none touched; no migration; no financial data read or written.
- **Financial integrity:** no EMI, payment, invoice, receipt, commission, payout,
  stock, accounting, or reconciliation code changed.
- **Auditability:** all changes are static frontend files + docs, fully traceable in Git.
- **Daily shop usability:** owner can already edit public business info via the
  existing admin Public Site settings; new pages surface that info to customers.
- **Future rental/leasing:** new URLs are additive and do not collide with future
  `/furniture-rental-asansol` or `/furniture-lease-asansol` (see future doc).
