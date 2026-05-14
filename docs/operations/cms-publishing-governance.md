# CMS Publishing Governance (Phase 8)

## Governance objective
Allow marketing/public information updates while preserving financial correctness, auditability, and core operational truth.

## Enforced boundaries in current code
- Admin-only editor for public profile: `IsAdmin` permission.
- Public reads only: `AllowAny` endpoints for profile/products/winners/stats/leads.
- Service-layer update function for profile writes with audit logging.
- No CMS write path to billing, subscription, inventory, accounting, draw execution, or HR modules.

## Mandatory do-not-mutate list
CMS/public content changes must not directly mutate:
- product canonical base price logic
- EMI schedule/payment ledgers
- receipts/invoices/credit-debit accounting state
- stock ledgers/movements
- draw outcome execution state
- contract truth after creation

## Change control checklist
1. Confirm admin actor and purpose.
2. Confirm content-only scope.
3. Apply change in admin public-site editor.
4. Verify public page rendering.
5. Verify no finance/inventory/winner services were touched.
6. Confirm audit event exists.

## Future additive governance work (proposed)
- content versioning with draft/review/published states
- multi-step approvals for sensitive public claims
- media asset lifecycle policy (upload, review, publish, archive)
- dedicated CMS modules for FAQ/policies/campaigns with role-scoped permissions
