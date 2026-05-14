# Public Product and Winner Content Controls

## Public product presentation
Code path:
- API: `/api/v1/public/products/`, `/api/v1/public/products/<id>/`
- Serializer: `backend/api/v1/serializers/public.py::PublicProductSerializer`
- Frontend pages: `/products`, `/products/[id]`

Exposed product fields are intentionally narrow:
- `id`, `product_code`, `name`, `base_price`, `category`, `subcategory`, `image`, `description`

Not exposed through public serializer:
- internal stock ledgers
- internal pricing/cost controls
- accounting controls
- internal feature flags and audit fields

## Winner publication
Code path:
- API routes in `backend/api/v1/routes/public.py`
- Winner/trust endpoints:
  - `/public/latest-winner/`
  - `/public/winners/`
  - `/public/winner-history/`
  - `/public/lucky-draws/*` trust/certificate/verification/winner

Controls:
- winner name is masked (`winner_name_masked`)
- public payload avoids private customer identifiers
- draw trust metadata is published from draw commit/reveal data where present
- winner benefit note keeps future-EMI-only rule explicit

## Operational guardrails
- Public pages must never fabricate winner rows.
- Public pages must never fabricate product price/stock counters.
- If API is unavailable, show explicit error/unavailable states.
- Public content cannot mutate draw/payment/inventory/accounting truth.
