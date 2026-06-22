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

## Dashboard endpoints (M1 — verified)

| Endpoint | Method | Used by | Notes |
|---|---|---|---|
| `/api/v1/admin/dashboard/` | GET | DashboardPage | Cached 60s server-side. Returns financial, EMI, subscriptions, batches, risk, collections, recent activity, winner surface, reconciliation, commission summary, portfolio mix, CRM leads, subscription KPIs, due subscriptions. |
| `/api/v1/dashboards/summary-v2/` | GET | Not yet used | Role-based canonical summary with filter support. Available for future dashboard filter/window support. |
| `/api/v1/dashboards/surfaces/upcoming/` | GET | Not yet used | Paginated upcoming due subscriptions. |
| `/api/v1/dashboards/surfaces/overdue/` | GET | Not yet used | Paginated overdue subscriptions. |
| `/api/v1/dashboards/surfaces/recent-payments/` | GET | Not yet used | Paginated recent payments. |
| `/api/v1/dashboards/surfaces/winners/` | GET | Not yet used | Paginated winner items. |
| `/api/v1/dashboards/surfaces/reconciliation-exceptions/` | GET | Not yet used | Paginated reconciliation exceptions. |

### Dashboard response assumptions

- All money values arrive as string decimals from backend (e.g., `"15000.00"`)
- Counts arrive as integers
- `collections` sub-object includes gross/net/reversed breakdown for today
- `risk` includes healthy/at_risk/high_risk/defaulted counts + default_rate float
- `reconciliation.results` may be empty; `flagged_count` indicates alert level
- `due_subscriptions` is capped to top 10 server-side
- `recent_activity` shows today's payments only

### Dashboard API gaps

- No time-window filtering on `/admin/dashboard/` (only `/dashboards/summary-v2/` supports `window` parameter). If admin needs date range filtering, either consume summary-v2 or request backend enhancement.
- Stock/inventory alerts are not included in the admin dashboard response. If stock alerts are needed, a separate inventory endpoint is required.
- Accounting bridge alerts are available via `/admin/accounting/bridge-reconciliation/` but not embedded in the dashboard response.

## Customer endpoints (M2 — verified)

| Endpoint | Method | Used by | Notes |
|---|---|---|---|
| `/api/v1/admin/customers/` | GET | CustomersPage | Paginated list. Query params: `search`/`q`, `kyc_status`, `status` (ACTIVE/INACTIVE), `page`, `page_size`. Ordered by `-created_at`. Admin only. |
| `/api/v1/admin/customers/` | POST | CustomerFormDrawer | Create customer with optional username/password. Admin only. |
| `/api/v1/admin/customers/<id>/` | GET | CustomerDetailDrawer | Full customer with subscription aggregates and outstanding balances. Admin only. |
| `/api/v1/admin/customers/<id>/` | PATCH | CustomerFormDrawer | Update name, phone, email, address, city. Admin only. |
| `/api/v1/admin/customers/<id>/` | DELETE | **Hidden — not exposed in UI** | Hard delete via Django ModelViewSet. No custom destroy override. PROTECT FK constraints on Subscription, Payment, SupportRequest, ContractReference, DirectSaleReturn, CreditLedgerEntry, CustomerRefund, RentLeaseCollection, etc. will raise unhandled ProtectedError (500) for any customer with business history. Deletion of brand-new customers with zero linked records would succeed and permanently destroy the record. UI intentionally does not expose this action. |
| `/api/v1/admin/customers/<id>/kyc-decision/` | POST | KycDecisionDialog | Body: `{ status: "APPROVED"|"VERIFIED"|"REJECTED"|"PENDING"|"SUBMITTED", reason?: string }`. Returns updated KYC fields. Admin only. |
| `/api/v1/admin/customers/<id>/operational-summary/` | GET | Not yet used | Full operational profile. Available for future detail expansion. |
| `/api/v1/admin/customers/<id>/kyc-documents/upload/` | POST | Not yet used | KYC document upload. |
| `/api/v1/admin/customers/<id>/kyc-documents/audit-trail/` | GET | Not yet used | KYC audit trail. |

### Customer response assumptions

- All money values arrive as string decimals from backend (e.g., `"15000.00"`)
- `status` is computed from `user.is_active`: `"ACTIVE"` or `"INACTIVE"`
- `kyc_status` choices: `PENDING`, `SUBMITTED`, `APPROVED`, `VERIFIED`, `REJECTED`
- Subscription aggregates (`active_subscription_count`, `total_subscription_value`, etc.) are annotated via subqueries, not separate requests
- `profile_photo_url` is null when no photo exists; otherwise absolute URL
- `gstin` is derived from the customer's latest direct sale; may be null
- `customer_code` and `customer_source` are read-only fields
- Search supports: name, phone, email, username, customer_code, GSTIN, and numeric ID

### Customer API gaps

- No dedicated endpoint for customer KYC document list (only upload and audit-trail exist under admin routes). The KYC review queue (`/admin/kyc/review-queue/`) is cross-owner and may serve as a workaround.
- No customer activity/timeline endpoint in the admin customers ViewSet; a separate `AdminCustomerTimelineView` exists at an unconfirmed route.
- No inline subscription list on the customer detail — subscription aggregates are provided but individual subscription records require the subscriptions module endpoint.
- No customer-specific payment history endpoint in admin customers — payment data lives in the payments module.
- No safe archive/deactivate endpoint for customers. The DELETE endpoint is a hard delete with no soft-delete fallback. The only way to "deactivate" a customer is to set `user.is_active = False` via a separate mechanism (not available through the customer admin serializer's writable fields). This is a backend gap — admin-vite should not invent a workaround.
- Customer delete returns unhandled ProtectedError (500) when linked records exist, not a clean 400 validation error. Until the backend adds proper error handling for this case, the delete action is intentionally hidden from the UI.
