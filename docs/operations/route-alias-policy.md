# Route Alias Policy

## Canonical Naming
- Use `commissions` (never `commisions`) for new links, APIs, and UI labels.
- Use `/api/v1/admin/billing/products/search/` as canonical billing product search endpoint.

## Backward-Compatible Aliases (Temporary)
- Typo route aliases (`commisions`) remain redirect-only compatibility paths.
- Deprecated API alias retained:
  - `/api/v1/admin/billing/product-search/`
- Canonical API:
  - `/api/v1/admin/billing/products/search/`

## Client Guidance
- Frontend service callsites must use canonical paths.
- Alias routes stay only to prevent breaking older bookmarks/tests during migration.
- Any new tests should assert canonical endpoints first and alias behavior second.
