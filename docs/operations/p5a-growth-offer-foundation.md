# P5A — Growth Foundation: Offer Packages and Plan Templates

## Summary

P5A adds controlled growth configuration infrastructure to SUBIDHA CORE. Admins can define reusable `PlanTemplate` blueprints and time-bounded `OfferPackage` records for Lucky EMI, RENT, and LEASE offerings. All pricing, eligibility, and preview functions are advisory only. No subscription is created, no EMI is recalculated, and no financial record is mutated.

## Files Changed

### Backend

| File | Type | Description |
|---|---|---|
| `subscriptions/models_growth_offers.py` | New | PlanTemplate, OfferPackage, OfferPackageLine, enums |
| `subscriptions/apps.py` | Modified | Register models_growth_offers import |
| `subscriptions/migrations/0097_growth_offers_p5a.py` | New | Auto-generated migration |
| `subscriptions/services/growth_offer_service.py` | New | build_plan_template_preview, build_offer_package_preview, evaluate_offer_package_eligibility, list_active_offer_packages, validate_offer_package_configuration |
| `api/v1/views/admin_growth_offers.py` | New | AdminPlanTemplateListView, AdminPlanTemplateDetailView, AdminOfferPackageListView, AdminOfferPackageDetailView, AdminOfferPackagePreviewView |
| `api/v1/routes/admin_growth_offers.py` | New | Route module |
| `api/v1/urls.py` | Modified | Include admin_growth_offers route |
| `tests/subscriptions/test_growth_offers.py` | New | 35 tests |

### Frontend

| File | Type | Description |
|---|---|---|
| `src/lib/routes.ts` | Modified | growth, growthPlanTemplates, growthOfferPackages, growthRequests, growthPartnerPerformance, growthRetention route constants |
| `src/services/growth.ts` | New | listPlanTemplates, getPlanTemplate, createPlanTemplate, updatePlanTemplate, listOfferPackages, getOfferPackage, createOfferPackage, updateOfferPackage, getOfferPackagePreview |
| `src/config/admin-route-registry.ts` | Modified | Growth & Offers registry group (6 entries) |
| `src/app/(dashboard)/admin/growth/page.tsx` | New | Growth hub page |
| `src/app/(dashboard)/admin/growth/plan-templates/page.tsx` | New | Plan templates list |
| `src/app/(dashboard)/admin/growth/offer-packages/page.tsx` | New | Offer packages list |
| `src/app/(dashboard)/admin/growth/requests/page.tsx` | New | Stub for P5B |
| `src/app/(dashboard)/admin/growth/partner-performance/page.tsx` | New | Stub for P5C |
| `src/app/(dashboard)/admin/growth/retention/page.tsx` | New | Stub for P5D |

## Migrations Created

- `subscriptions/migrations/0097_growth_offers_p5a.py`
  - Creates `growth_plan_templates`
  - Creates `growth_offer_packages`
  - Creates `growth_offer_package_lines`
  - Adds 3 composite indexes

## API Contract Changes

### New Endpoints (admin-only)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/growth/plan-templates/` | List plan templates (filter: plan_type, is_active) |
| POST | `/api/v1/admin/growth/plan-templates/` | Create plan template |
| GET | `/api/v1/admin/growth/plan-templates/{id}/` | Get plan template |
| PATCH | `/api/v1/admin/growth/plan-templates/{id}/` | Update plan template |
| GET | `/api/v1/admin/growth/offer-packages/` | List offer packages (filter: status, plan_type) |
| POST | `/api/v1/admin/growth/offer-packages/` | Create offer package |
| GET | `/api/v1/admin/growth/offer-packages/{id}/` | Get offer package |
| PATCH | `/api/v1/admin/growth/offer-packages/{id}/` | Update offer package |
| GET | `/api/v1/admin/growth/offer-packages/{id}/preview/` | Advisory preview with eligibility |

All endpoints: `IsAdmin` permission. HTTP 403 for cashier, customer, partner roles.

## Existing Data Impact

None. No existing model, record, or migration is touched. New tables are additive.

## Financial Integrity Impact

None. No Subscription, EMI, Payment, JournalEntry, AccountingBridgePosting, StockLedger, LuckyDraw, Commission, or Payout row is created or mutated by any function in this phase.

`OfferPackageLine.price_override` and `discount_value` are read as preview/config data only. `Product.base_price` is never mutated.

## Auditability Impact

`created_by` and `updated_by` FK fields on PlanTemplate and OfferPackage provide actor tracking for all config changes.

## Daily Shop Usability Impact

No change to existing cashier, payment, delivery, subscription, or EMI flows. New admin pages appear in the "Growth & Offers" sidebar group and are accessible only to admin role.

## Future Rent/Lease Compatibility Impact

- RENT/LEASE templates reject `requires_lucky_id=True` at model validation.
- `default_security_deposit_percent` is available only on RENT/LEASE templates.
- P5B can reference `PlanTemplate` and `OfferPackage` for growth requests without model changes.
- P5C and P5D can read OfferPackage state for performance and retention intelligence.

## Tests Added

35 tests in `tests/subscriptions/test_growth_offers.py`:

- Create EMI, RENT, LEASE templates
- RENT/LEASE cannot require lucky ID (ValidationError)
- EMI lucky-plan template can require batch + lucky ID
- EMI template rejects security deposit percent
- RENT template allows security deposit percent
- Create offer package with product lines
- price_override and discount_value do not mutate Product.base_price
- list_active_offer_packages excludes DRAFT, expired, future-start packages
- list_active_offer_packages filters by plan_type
- eligibility returns advisory risk fields (BLOCKED → not_recommended, HIGH → approval_required)
- eligibility and list create no financial records
- validate_offer_package_configuration catches invalid date range and inactive template
- Admin CRUD (list, create, get, patch) for templates and packages
- Admin can get offer package preview with eligibility
- Customer and partner blocked (HTTP 403)
- Creating an offer package creates no Subscription/EMI/JournalEntry
- Duplicate template_code rejected (HTTP 409)
- 404 for nonexistent template

## Test Commands Run

```
python manage.py test tests.subscriptions.test_growth_offers --verbosity=1
python manage.py test tests.subscriptions tests.accounting tests.billing tests.reconciliation --verbosity=1
```

## Risks / Deferred Items

- `OfferPackageLine` price override and discount are preview-only; no frontend form to create lines (lines can be added via API or future P5E UI).
- Public visibility field (`is_public_visible`) is stored but no public endpoint is exposed in P5A. Public catalog in a future phase.
- `audience_type=PARTNER_REFERRED` check is advisory only; the partner FK lookup may return false warnings if partner relation model evolves.
- No approval workflow is triggered from growth offer config changes. Approval gating for contracts referencing offers is a future concern.
