# Business Compliance Document Handling

## Scope
Admin-only handling of sensitive compliance documents and public-safe summaries.

## Storage model
- `BusinessComplianceDocument` (`backend/subscriptions/models_business_setup.py`)
- key controls:
  - `document_type`
  - `public_visibility`: `PRIVATE` or `PUBLIC_SUMMARY_ONLY`
  - `verification_status`
  - `public_summary`
  - `notes`
  - optional `file`

## Access rules
- Admin-only API access:
  - `GET/POST /api/v1/admin/public-site/business-compliance/documents/`
  - `GET/PATCH /api/v1/admin/public-site/business-compliance/documents/<id>/`
- Public API never exposes private file metadata:
  - `GET /api/v1/public/business-compliance/summary/`

## Operational rules
- Default all sensitive docs as `PRIVATE`.
- Use `PUBLIC_SUMMARY_ONLY` only when management approves a non-sensitive summary.
- Do not publish raw document scans by default.
- Keep personal identifiers and banking/tax proof off public pages.

## Legal-safe disclosure pattern
- Public page can show:
  - status text
  - high-level verification summary
- Public page must not show:
  - private file URLs
  - internal notes
  - unverified registration claims
