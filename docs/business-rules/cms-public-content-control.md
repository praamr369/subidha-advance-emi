# CMS + Public Content Control

## Confirmed current implementation (code-backed)
- Admin CMS endpoint exists for public business profile only:
  - `GET/PATCH /api/v1/admin/public-site/profile/`
  - View: `backend/api/v1/views/admin_public_site.py`
  - Serializer: `backend/api/v1/serializers/public_site.py`
  - Service: `backend/subscriptions/services/public_site_service.py`
- Public profile endpoint exists and is anonymous-safe:
  - `GET /api/v1/public/business-profile/`
  - View: `backend/api/v1/views/public_site.py`
- Legal/policy registry endpoints exist:
  - Admin: `/api/v1/admin/public-site/policies/**`
  - Public: `/api/v1/public/policies/**`
  - Views: `backend/api/v1/views/admin_policy_site.py`, `backend/api/v1/views/public_policy_site.py`
  - Service: `backend/subscriptions/services/policy_governance_service.py`
- Business compliance document governance endpoints exist:
  - Admin: `/api/v1/admin/public-site/business-compliance/**`
  - Public summary: `GET /api/v1/public/business-compliance/summary/`
- Public catalogue and winner endpoints exist:
  - `GET /api/v1/public/products/`
  - `GET /api/v1/public/products/<id>/`
  - `GET /api/v1/public/latest-winner/`, `/public/winners/`, `/public/winner-history/`
  - Routes: `backend/api/v1/routes/public.py`

## Financial and operational boundary
CMS/public content controls are display-layer only.
They must not mutate canonical truth for:
- product base price source-of-record edits
- EMI schedule logic
- payment posting history
- inventory/stock movements
- accounting postings or reconciliation
- winner draw execution
- contract terms after subscription creation

## Role boundary
- Admin public-site editor is restricted by `IsAdmin`.
- Public endpoints use `AllowAny` and are readable without authentication.
- Non-admin roles (customer/partner/cashier/vendor) cannot call admin CMS controls.

## Publishing and audit boundary
- Public profile updates flow through `upsert_public_business_profile` service.
- Each update emits `AuditLog.ActionType.PUBLIC_SITE_UPDATED`.
- Policy draft/publish/archive operations also emit `PUBLIC_SITE_UPDATED` audit metadata events.
- Public winner pages publish masked identity and draw proof metadata without internal customer identifiers.

## Not yet endpoint-backed (must remain governance-safe)
The following remain non-endpoint-backed in current repo state:
- homepage banner CMS
- FAQ CMS
- campaign page CMS
- media library CMS

These remain controlled by code/content constants and should not be represented as fake operational controls.

## Future additive work (proposed)
- Add dedicated content models (status: draft/review/published, versioned).
- Add admin-only publish workflow with actor, timestamp, and approval trail.
- Keep finance/inventory/winner engines read-only from CMS services.
