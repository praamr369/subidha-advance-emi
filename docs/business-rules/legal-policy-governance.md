# Legal Policy Governance (Phase 11)

## Implemented scope (code-backed)

### Policy registry and lifecycle
- Model: `backend/subscriptions/models_business_setup.py`
  - `PolicyPage`
  - fields: `slug`, `version`, `category`, `title`, `summary`, `content`, `status`, `effective_date`, `last_reviewed_at`, `published_at`, `published_by`, `created_by`, `updated_by`
  - statuses: `DRAFT`, `PUBLISHED`, `ARCHIVED`
- Constraints:
  - unique `(slug, version)`
  - one published row per slug (`unique_published_policy_slug`)

### Compliance document register
- Model: `backend/subscriptions/models_business_setup.py`
  - `BusinessComplianceDocument`
  - private-by-default visibility control (`PRIVATE`, `PUBLIC_SUMMARY_ONLY`)
  - verification state (`PENDING`, `VERIFIED`, `REJECTED`, `NOT_PROVIDED`)
  - optional file storage with admin-only API access

### Service-layer controls
- Service: `backend/subscriptions/services/policy_governance_service.py`
  - `create_policy_page`, `update_policy_page`, `create_draft_from_policy`
  - `publish_policy_page`, `archive_policy_page`
  - `seed_default_policy_pages`
  - placeholder rendering (`[WEBSITE_URL]`, `[BUSINESS_PHONE]`, `[BUSINESS_EMAIL]`, `[BUSINESS_ADDRESS]`, `[GST_STATUS_PUBLIC_TEXT]`, `[UDYAM_STATUS_PUBLIC_TEXT]`)
- Published content lock:
  - published legal content cannot be directly edited; create a new draft version first.

### API endpoints
- Admin-only
  - `GET/POST /api/v1/admin/public-site/policies/`
  - `POST /api/v1/admin/public-site/policies/seed-defaults/`
  - `GET /api/v1/admin/public-site/policies/by-slug/<slug>/`
  - `PATCH /api/v1/admin/public-site/policies/<id>/`
  - `POST /api/v1/admin/public-site/policies/<id>/publish/`
  - `POST /api/v1/admin/public-site/policies/<id>/archive/`
  - `POST /api/v1/admin/public-site/policies/<id>/create-draft/`
  - `GET/POST /api/v1/admin/public-site/business-compliance/documents/`
  - `GET/PATCH /api/v1/admin/public-site/business-compliance/documents/<id>/`
  - `GET /api/v1/admin/public-site/business-compliance/summary/`
- Public (no auth)
  - `GET /api/v1/public/policies/`
  - `GET /api/v1/public/policies/<slug>/` (published only)
  - `GET /api/v1/public/business-compliance/summary/`

## Financial integrity boundary
- Policy and compliance CMS are display/governance layers only.
- They do not mutate canonical financial truth:
  - product base price
  - EMI schedules and posting
  - payment history
  - lucky draw outcomes
  - commission/payout/reconciliation histories
  - inventory/accounting ledgers

## Public trust boundary
- Draft or archived policies are never publicly returned.
- Public compliance summary excludes private document file fields and internal notes.
- No fake GST/Udyam/license numbers are emitted when not available.

## Future additive work (proposed, not implemented)
- Optional approval matrix (multi-approver legal signoff) before `publish`.
- Per-policy change request tickets linked to publish actions.
- Rich text editor with structured redline history.
