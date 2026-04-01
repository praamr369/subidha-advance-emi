# SUBIDHA CORE — Phase 1 Audit (Repo Map + Risks)

## A. Full repo map (current)

- `backend/accounts` — user model + JWT token serializer.
- `backend/subscriptions` — core domain entities (customer, product, batch, lucky_id, subscription, emi, payment, lucky_draw, ledger, audit).
- `backend/api/v1` — route modules, serializers, permissions, and admin/customer/partner/public/cashier views.
- `frontend/src/app` — App Router routes for public/auth/dashboard role surfaces.
- `frontend/src/components` — reusable UI/layout/feedback and enterprise table/form wrappers.
- `frontend/src/services` — API wrappers (`api.ts`, `admin.ts`, auth/domain services).
- `frontend/src/domains` — partial subscription domain modularization.

## B. Backend audit findings

1. **Public route file had duplicated classes/methods and duplicate URL entries**, causing maintenance risk and ambiguous behavior.
2. Lucky winner lookup used legacy reverse relation (`subscription_set`) inconsistent with model `related_name="subscriptions"`.
3. Health-check endpoint missing in public API surface.
4. Core business logic is partially serviceized (draw/subscription/payment/reconciliation), but large admin viewset still contains query/action orchestration mixed with transport concerns.

## C. Frontend audit findings

1. App Router has broad admin route coverage, but page implementations are currently genericized and may need domain-specific enrichment for financial drill-down UX.
2. Proxy guard is now primary route protection boundary; role claim parsing is present.
3. New enterprise table/form wrappers exist, but not all modules yet use domain-specific column schemas and form workflows.

## D. Integration mismatches

1. Frontend added new dependencies (`react-hook-form`, `zod`, `@tanstack/react-table`), but install may be blocked in restricted environments.
2. Some frontend pages currently consume generic `/admin/payments/` lists where dedicated reconciliation summary endpoints may be expected in future.
3. Existing lint baseline still contains legacy component issues unrelated to newly added enterprise wrappers.

## Risk list

- **High**: Financial screens could regress if generic list/detail pages replace deep business workflows without incremental parity checks.
- **High**: Role and auth assumptions must remain backend-enforced; frontend guard is additive only.
- **Medium**: Incomplete test coverage for service-layer invariants and draw/payment idempotency.
- **Medium**: Route/file complexity may reintroduce collisions if admin modules evolve without route contracts.

## Refactor priority list

1. Stabilize public/auth/admin API transport correctness and remove duplicate/conflicting route definitions.
2. Expand service-layer tests for draw/payment/subscription/reconciliation invariants.
3. Incrementally enrich admin financial pages with domain-specific detail cards (allocations, waivers, audit timeline) while preserving current APIs.
4. Introduce typed shared API response envelopes for paginated list/detail actions.
5. Add CI checks for route collision, lint subset, and backend smoke checks.
