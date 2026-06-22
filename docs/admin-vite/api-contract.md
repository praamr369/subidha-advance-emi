# Admin Vite API Contract

This document does not define a new backend API.

It defines how admin-vite must consume the existing backend contract during migration.

The backend remains the source of truth, and admin-vite must adapt to it rather than asking the backend to become a frontend-shaped API.

## Contract rules

1. Use the existing `/api/v1` backend surface.
2. Do not invent new endpoints in the frontend.
3. Do not assume new response fields exist unless they are already confirmed in code or a separate backend change has been approved.
4. Do not move financial, stock, or reconciliation logic into the client.
5. Do not alter write semantics from the frontend.
6. Keep client-side normalization in service helpers, not spread across pages.
7. Treat backend validation as authoritative.
8. Treat null, partial, and paginated payloads defensively.

## Stable backend families admin-vite must respect

| Backend family | admin-vite expectation |
|---|---|
| `/api/v1/auth/` | Use existing authentication and session/JWT behavior. |
| `/api/v1/admin/` | Use for admin operational data only where already supported. |
| `/api/v1/customers/` and `/api/v1/customer/` | Use existing customer data surfaces without renaming the business meaning. |
| `/api/v1/partner/` | Keep partner data isolated from admin-only mutations. |
| `/api/v1/vendor/` | Keep vendor flows separate from customer and admin profile truth. |
| `/api/v1/accounting/` | Read/write only through approved accounting flows. |
| `/api/v1/billing/` | Preserve billing and invoice semantics exactly as implemented. |
| `/api/v1/inventory/` | Preserve stock and movement semantics exactly as implemented. |
| `/api/v1/dashboards/` | Use for operational summaries where available. |
| `/api/v1/crm/` and `/api/v1/service-desk/` | Use existing operational CRM and service surfaces where approved. |
| `/api/v1/reminders/` | Keep reminders as operational follow-up data, not financial truth. |
| `/api/v1/public/` and `/api/v1/winner/` | Do not expose private admin data through public endpoints. |
| `/api/v1/executive/` | Keep executive reporting read-only unless backend says otherwise. |

## Data handling contract

admin-vite must:

- display backend-calculated values as backend-calculated values
- avoid re-deriving financial truth in the browser
- preserve backend error messages where they are safe to show
- show loading, empty, and error states for every operational page
- tolerate incomplete records without crashing
- never treat a UI cache as authoritative

## Mutation contract

For create, update, reversal, approval, or collection flows:

- the backend must remain the final decision-maker
- the client may prevalidate UX rules, but it must not replace backend validation
- the client must not simulate posting, reconciliation, stock movement, or accounting outcomes
- the client must not infer success from navigation alone

## Module-facing contract expectations

| Module | Contract emphasis |
|---|---|
| Dashboard | Summary endpoints must be read-only and never fabricate KPIs. |
| Customers | Customer profile and linked records must stay consistent with backend ownership. |
| Products | Product metadata must not rewrite pricing or stock behavior. |
| Lucky Plan | Lucky Plan actions must preserve schedule, draw, and waiver semantics. |
| Subscriptions | Subscription create/edit flows must respect backend contract rules. |
| Payments | Payment posting must remain server-authorized and auditable. |
| Billing | Billing actions must preserve invoice and receipt provenance. |
| Inventory | Stock adjustments, movement, and availability must stay source-linked. |
| Delivery | Delivery state must not be conflated with payment or contract state. |
| Rent/Lease | Rent/lease must remain separate from EMI unless the backend explicitly bridges them. |
| Accounting | Journal and book views must remain read-only where backend is read-only. |
| Reconciliation | Mismatch handling must be presented, not silently resolved in the client. |
| Reports | Reports must remain read-only and source-linked. |
| Settings | Settings writes must use existing backend validation and permission checks. |

## Unsupported assumptions

If admin-vite needs a field, filter, or endpoint that does not already exist, that is a backend/API gap.

The correct response is to document the gap and request an approved backend change later.

The correct response is not to:

- invent a temporary client-only field
- guess at hidden business logic
- overload another endpoint with unrelated semantics
- bypass permission checks

## Safe integration rule

All API adaptation should happen in the frontend service layer, not in pages, and not by mutating API responses into false shapes.
