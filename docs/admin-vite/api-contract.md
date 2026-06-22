# Admin Vite API Contract

This document does not define a new backend API.

It defines how admin-vite must consume the existing backend contract during migration.

The backend remains the source of truth, and admin-vite must adapt to it rather than asking the backend to become a frontend-shaped API.

## Local cutover configuration

For local development during the admin login cutover:

- backend database name: `subidha_core`
- admin-vite API base URL: `http://127.0.0.1:8000/api/v1`
- Next.js admin app URL env var: `NEXT_PUBLIC_ADMIN_APP_URL`
- Vite admin is the preferred admin login surface
- the legacy Next.js admin remains a fallback and must stay available
- public, customer, partner, and vendor portals remain in Next.js
- the backend + PostgreSQL database remain the source of truth
- real local credentials used for setup are not committed to tracked source files

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

## Lucky Plan contract (M4 - verified against existing backend routes)

admin-vite Lucky Plan must use the existing Django admin surface only. It must not invent a new draw engine, waiver engine, or EMI calculator.

### Endpoints used

| Endpoint | Method | Purpose | Notes |
|---|---|---|---|
| `/api/v1/admin/batches/` | GET | Batch register | Used for the Batches tab. Paginated list with batch counts from `BatchAdminSerializer`. |
| `/api/v1/admin/batches/<id>/` | GET | Batch detail | Used for batch detail drawer. Returns batch fields plus annotated counts. |
| `/api/v1/admin/batches/<id>/summary/` | GET | Batch summary | Used for batch metrics, Lucky ID counts, and draw counts. |
| `/api/v1/admin/batches/<id>/control-center/` | GET | Readiness state | Used for lock/commit/execute readiness and blocker display. |
| `/api/v1/admin/lucky-ids/` | GET | Lucky ID register | Used for Lucky ID table and 100-slot grid. Query by `batch_id` or `batch`. |
| `/api/v1/admin/lucky-ids/<id>/` | GET | Lucky ID detail | Used if a Lucky ID detail view is added later. |
| `/api/v1/admin/lucky-ids/available/` | GET | Available Lucky IDs | Read-only helper. Used only if the UI needs the backend availability slice. |
| `/api/v1/admin/lucky-draws/` | GET | Draw register | Used for monthly draw list, winner list, and waiver list. Query by `batch` and `is_revealed`. |
| `/api/v1/admin/lucky-draws/<id>/` | GET | Draw detail | Used for commit/reveal/winner display. |
| `/api/v1/admin/lucky-draws/<id>/timeline/` | GET | Draw audit timeline | Used for audit visibility. |
| `/api/v1/admin/lucky-draws/<id>/winner-settlement/` | GET | Winner settlement | Used for waiver summary and waived EMI rows. |

### Optional mutation endpoints already present in backend

These endpoints exist in Django, but the current admin-vite workbench keeps draw/waiver execution read-only and does not surface them as buttons:

| Endpoint | Method | Status in admin-vite |
|---|---|---|
| `/api/v1/admin/batches/<id>/lock/` | POST | Supported by backend, not surfaced in this phase. |
| `/api/v1/admin/batches/<id>/commit-draw/` | POST | Supported by backend, not surfaced in this phase. |
| `/api/v1/admin/batches/<id>/execute-draw/` | POST | Supported by backend, not surfaced in this phase. |
| `/api/v1/admin/batches/<id>/create-commit/` | POST | Legacy flow exists, not surfaced in this phase. |
| `/api/v1/admin/lucky-draws/<id>/reveal/` | POST | Legacy reveal flow exists, not surfaced in this phase. |
| `/api/v1/admin/batches/` | POST | Safe batch create hook exists in the API layer. |
| `/api/v1/admin/batches/<id>/` | PATCH | Safe batch update hook exists in the API layer. |

### Lucky Plan response assumptions

- batch rows include `batch_code`, `status`, `total_slots`, `duration_months`, `draw_day`, `start_date`, and annotation fields such as `subscription_count`, `lucky_id_count`, `winner_count`, and `available_slots`
- batch summary includes `available_lucky_ids`, `assigned_lucky_ids`, `won_lucky_ids`, `draw_eligible_count`, and the monthly/historical booked values as backend strings
- control-center includes `snapshot_status`, `commit_status`, `draw_status`, `finance_waiver_posting_status`, and `disabled_reasons`
- Lucky ID rows include `status`, `assignment_state`, `assignment_note`, `is_currently_assigned`, `is_available`, and historical linkage fields
- draw rows include `committed_hash`, `public_commit_hash`, `winner_lucky_number`, `winner_customer_name`, `waived_emi_count`, `waived_amount`, and `waiver_scope`
- winner-settlement includes `waived_emis` rows with `month_no`, `due_date`, `amount`, and `status`

### Lucky Plan API gaps

- there is no dedicated backend endpoint for a pre-built 00-99 Lucky ID grid per batch; the UI assembles the grid from the Lucky ID list
- there is no dedicated backend winners endpoint for the admin workbench; winner display comes from draw detail and winner-settlement
- there is no dedicated backend waiver-summary endpoint separate from winner-settlement
- the frontend must not calculate winner selection, waiver amount, EMI status, or draw outcomes
- the frontend must treat missing rows as a data gap, not as a reason to invent backend state

### Lucky Plan safety rules

- draw, winner, and waiver screens are read-only in admin-vite for this phase
- dangerous actions stay backend-authorized and require a separate follow-up if the UI ever exposes them
- Lucky ID status display may show `BLOCKED` when backend assignment state is frozen, but the browser must not invent that state itself

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

## Admin login cutover rule

admin-vite is the preferred login entry for admin, cashier, staff, and superuser accounts.

The legacy Next.js admin route remains available only as a fallback for compatibility and verification.

The Next.js login flow may still serve public, customer, partner, and vendor roles, but admin redirects should point to the Vite admin app configured by `NEXT_PUBLIC_ADMIN_APP_URL`.

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
