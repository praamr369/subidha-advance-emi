# SUBIDHA CORE Team Handoff

This handoff is for the current production-ready Lucky Plan EMI system after RC validation and hardening.

## Scope

- Backend and frontend are both live-operation code paths.
- Financial truth must continue to flow through existing Django service and API layers.
- Do not bypass payment, waiver, commission, payout, or reconciliation code with direct database edits.

## Source of truth in the codebase

- Core domain models: `backend/subscriptions/models.py`
- User and role model: `backend/accounts/models.py`
- Admin serializers for customers, products, subscriptions, payments: `backend/api/v1/serializers/admin_resources.py`
- Customer and product import flows: `backend/api/v1/views/admin_resources.py`
- Subscription creation logic: `backend/api/v1/serializers/admin_resources.py` and `backend/subscriptions/services/subscription_service.py`
- Admin routes: `backend/api/v1/routes/admin.py`
- Cashier routes: `backend/api/v1/routes/cashier.py`
- Partner routes: `backend/api/v1/routes/partner.py`

## Current operational roles

| Role | Current operational scope |
| --- | --- |
| Admin | Products, batches, lucky IDs, customers, subscriptions, payment reversal, reports, reconciliation, partner collection approvals, internal users |
| Cashier | Pending EMI lookup, EMI search, payment collection, payment history, receipt lookup |
| Partner | Customer/subscription visibility, payment history visibility, collection request submission, earnings and commission exports |
| Customer | Self-service views for subscriptions, payments, deliveries, profile, and support requests |

## Supported onboarding and import surfaces today

| Data type | Current safe path | Notes |
| --- | --- | --- |
| Customer | Admin UI create or customer CSV import | CSV import is real, but it only accepts `name` and `phone` and generates credentials server-side |
| Product | Admin UI create/edit or product CSV import | CSV import is real and supports controlled product create/update |
| Subscription | Admin UI create or POST `/api/v1/admin/subscriptions/` | No confirmed bulk CSV subscription importer found in the current code |

## Important operational constraints

- Product base price is the contract total for Lucky Plan EMI subscriptions.
- For EMI subscriptions, `batch` and `lucky_id` belong together and tenure must equal the batch duration.
- A batch in `OPEN` status must have exactly 100 slots, and lucky numbers are constrained to `00` through `99`.
- Payments and waived EMI states are distinct and must stay distinguishable.
- Winner state is not a generic edit; it is assigned through lucky draw flow only.
- Partner collection submission is not the same as final payment posting. Partner flows create collection requests that admins review.

## Team rules for live operations

- Use admin workspaces for any action that changes financial state or audit state.
- Use cashier workspaces for counter collection only.
- Use partner workspaces for partner-scoped visibility and collection requests only.
- Do not “fix” money records by editing rows manually in the database.
- Do not delete or overwrite payment history to correct mistakes. Use the existing reversal and review flows.

## Environment and deployment references

- Production env contract: `backend/.env.production.template`
- Frontend env contract: `frontend/.env.production.template`
- Deployment handoff: `docs/deployment/PRODUCTION_HANDOFF.md`
- Production checklist: `docs/deployment/production-checklist.md`
- RC and smoke references: `docs/deployment/RELEASE_CANDIDATE_VALIDATION.md` and `docs/deployment/RELEASE_SMOKE_CHECKLIST.md`

## Data onboarding references

- Customer import template: `docs/imports/customer-import-template.csv`
- Product import template: `docs/imports/product-import-template.csv`
- Subscription onboarding reference template: `docs/imports/subscription-import-template.csv`
- Field mapping and behavior notes: `docs/imports/import-field-mapping.md`
- Daily process guide: `docs/operations/daily-shop-workflows.md`

## Known operational cautions

- Customer CSV import generates a username automatically, but the generated password is not returned in the response. If imported customers need portal login, plan an immediate password-reset step or use the admin create-customer flow instead.
- Product CSV import does not manage `is_active`, `is_emi_enabled`, `is_rent_enabled`, or `is_lease_enabled`. Review those flags in admin after import.
- Subscription onboarding is currently a controlled create flow, not a confirmed bulk importer.
- The active production settings contract is defined in `backend/core/settings/base.py`. Use the new production env template rather than older local examples when preparing deployment secrets.
