# Public SEO Route Map — Subidha Furniture

Canonical host: `https://subidhafurnitureasansol.com`. All rows are public,
index+follow, and served from the `(public)` route group. Metadata is produced by
`buildPublicMetadata()` (canonical, OG, Twitter, robots).

Legend: **New** = added this pass · **Existing** = already present.

| URL | Status | Purpose | Target keywords | H1 | Meta title | Schema | Data |
|---|---|---|---|---|---|---|---|
| `/` | Existing | Brand home, entry to all offers | Subidha Furniture Asansol; furniture store Asansol | Brand hero | via profile | Organization + WebSite | Live profile |
| `/furniture-store-asansol` | **New** | Local furniture-store landing | furniture store in Asansol; furniture shop near me | Furniture Store in Asansol — Subidha Furniture | Furniture Store in Asansol \| Subidha Furniture | FAQPage + Breadcrumb | Static + live profile CTAs |
| `/lucky-plan-emi-furniture-asansol` | **New** | Lucky Plan EMI explainer (compliance-safe) | Lucky Plan EMI furniture; furniture on EMI in Asansol | Lucky Plan EMI Furniture in Asansol | Lucky Plan EMI Furniture in Asansol \| Subidha Furniture | FAQPage + Breadcrumb | Static + live profile CTAs |
| `/delivery-asansol` | **New** | Delivery-area landing | furniture delivery in Asansol | Furniture Delivery in Asansol | Furniture Delivery in Asansol \| Subidha Furniture | FAQPage + Breadcrumb | Static + live profile CTAs |
| `/products` | Updated (SEO-2) | Live catalogue + category links | furniture in Asansol; buy furniture | Products | via helper | ItemList + FAQPage | Public product API |
| `/products/beds` | **New (SEO-2)** | Beds category | beds in Asansol; bed shop Asansol | Beds in Asansol — Subidha Furniture | Beds in Asansol \| Subidha Furniture | Breadcrumb + ItemList + FAQPage | Public product API |
| `/products/sofas` | **New (SEO-2)** | Sofas category | sofas in Asansol; sofa shop Asansol | Sofas in Asansol — Subidha Furniture | Sofas in Asansol \| Subidha Furniture | Breadcrumb + ItemList + FAQPage | Public product API |
| `/products/wardrobes` | **New (SEO-2)** | Wardrobes category | wardrobe shop in Asansol | Wardrobes in Asansol — Subidha Furniture | Wardrobes in Asansol \| Subidha Furniture | Breadcrumb + ItemList + FAQPage | Public product API |
| `/products/dining-tables` | **New (SEO-2)** | Dining category | dining table shop in Asansol | Dining Tables in Asansol — Subidha Furniture | Dining Tables in Asansol \| Subidha Furniture | Breadcrumb + ItemList + FAQPage | Public product API |
| `/products/mattresses` | **New (SEO-2)** | Mattresses category | mattress shop in Asansol | Mattresses in Asansol — Subidha Furniture | Mattresses in Asansol \| Subidha Furniture | Breadcrumb + ItemList + FAQPage | Public product API |
| `/products/appliances` | **New (SEO-2)** | Appliances category | home appliances in Asansol | Appliances in Asansol — Subidha Furniture | Home Appliances in Asansol \| Subidha Furniture | Breadcrumb + ItemList + FAQPage | Public product API |
| `/products/[id]` | Updated (SEO-3) | Product detail (public, finished goods) | model-specific | product name | via helper | **Product JSON-LD** (no reviews/rating) | Public product API |
| `/lucky-plan` | Existing | Lucky Plan overview | Lucky Plan EMI | Lucky Plan | via helper | — | Static/policy |
| `/rulebook` | Existing | Full Lucky Plan rulebook | lucky plan rules | Rulebook | via helper | — | Policy |
| `/delivery-policy` | Existing | Delivery terms | delivery policy | Delivery Policy | via helper | — | Policy |
| `/about` | Existing | Brand story | about Subidha Furniture | About | via helper | — | Static/profile |
| `/contact` | Existing | Contact + address | contact Subidha Furniture Asansol | Contact | via helper | Organization (global) | Live profile |
| `/faq` | Existing | General FAQ | furniture EMI questions | FAQ | via helper | — | Static |
| `/terms`, `/privacy`, `/lucky-plan-policy`, … | Existing | Legal/policy | policy names | page title | via helper | — | Policy |

## Internal linking (implemented)

- Home → all offers (existing nav/footer).
- `/furniture-store-asansol` → `/lucky-plan-emi-furniture-asansol`, `/products`,
  `/delivery-asansol`, `/about`, `/contact`.
- `/lucky-plan-emi-furniture-asansol` → `/lucky-plan`, `/rulebook`,
  `/lucky-plan-policy`, `/furniture-store-asansol`, `/contact`.
- `/delivery-asansol` → `/delivery-policy`, `/furniture-store-asansol`,
  `/products`, `/contact`.
- All three → live phone / WhatsApp / contact from the business profile.

## Candidate future routes (not built — see future-rental-leasing-seo.md)

- `/products/beds`, `/products/sofas`, `/products/wardrobes`,
  `/products/dining-tables`, `/products/mattresses`, `/products/appliances`
  (pending category-model decision).
- `/furniture-rental-asansol`, `/furniture-lease-asansol` (future business).
