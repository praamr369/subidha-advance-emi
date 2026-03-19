# Frontend Workflow QA Checklist (Ops Safety)

This checklist is for **manual operational verification** of the Lucky Plan EMI frontend.
It is intentionally **non-destructive** and does not assume any demo/mock data.

## Preconditions

- Frontend builds cleanly: `npm run build` (from `frontend/`)
- Backend is reachable and configured (JWT auth, correct base URL/env).
- Use test accounts for each role:
  - Admin
  - Partner
  - Customer
  - Cashier

## Global safety checks (all routes)

- **Loading**: shows a loading state (not blank, not raw JSON/HTML).
- **Error**: network/auth errors render a user-safe message (no Django HTML/debug pages in UI).
- **Empty**: zero-data views show a clear empty state (no misleading placeholders).
- **Navigation**: all visible links go to real routes; no `#` links.
- **Actions**: all visible buttons either work, or are clearly disabled with an honest reason.

## Admin workflows

### `/admin`
- KPI row renders (or shows safe error).
- Quick links navigate to:
  - `/admin/finance/commissions`
  - `/admin/finance/commissions/settled`
  - `/admin/finance/payout-batches`
- Queue/alerts panels render safely with empty/error states.

### `/admin/customers`
- List loads and renders.
- Empty state shown when no customers.
- No console/debug output shown to the user.

### `/admin/products`
- Table loads.
- Create route reachable: `/admin/products/create`.
- Detail route reachable from row click: `/admin/products/[id]`.

### `/admin/subscriptions`
- Filters update URL query params (`q`, `status`, `batch_id`, `page`) without crashing.
- Row click opens `/admin/subscriptions/[id]`.
- **Export Current View**:
  - Disabled when there are 0 rows.
  - Produces a CSV download when rows exist.

### `/admin/payments`
- Filters/search load results safely.
- Create route reachable: `/admin/payments/create`.
- Detail route reachable: `/admin/payments/[id]`.
- Verify reverse/collect flows show confirmation and safe errors.

### `/admin/payments/reconciliation`
- Loads snapshot + actionable reconciliation table.
- **Flag** action:
  - Prompts confirmation.
  - Handles failure safely (no silent failure).
- **Export Current View**:
  - Disabled when there are 0 rows.
  - Produces a CSV download when rows exist.

## Admin finance workflows

### `/admin/finance/commissions`
- Summary cards render.
- Filters apply/clear work.
- Links navigate:
  - Settled: `/admin/finance/commissions/settled`
  - Payout batches: `/admin/finance/payout-batches`

### `/admin/finance/commissions/settled`
- Settled list loads.
- Selecting rows updates selected count/total.
- **Create Payout Batch**:
  - Disabled when nothing selected.
  - Requires confirmation.
  - On success navigates to `/admin/finance/payout-batches/[id]`.

### `/admin/finance/payout-batches`
- Filters apply/clear work.
- Table rows open `/admin/finance/payout-batches/[id]`.

### `/admin/finance/payout-batches/[id]`
- Detail loads with header card + lines.
- **Export CSV** opens an export URL in a new tab/window.
- **Finalize Batch** (DRAFT only):
  - Requires confirmation
  - Handles errors safely
- **Cancel Batch** (DRAFT only):
  - Requires confirmation
  - Requires reason optional
  - Handles errors safely

## Admin reports

### `/admin/reports`
- Links to each report work:
  - `/admin/reports/revenue`
  - `/admin/reports/overdue`
  - `/admin/reports/batch-performance`
  - `/admin/reconciliation`

### `/admin/reports/revenue`
- Renders summary + table.
- **Export Current View** disabled when no rows; downloads CSV when rows exist.

### `/admin/reports/overdue`
- Renders summary + table.
- **Export Current View** disabled when no rows; downloads CSV when rows exist.

### `/admin/reports/batch-performance`
- Renders rows (or safe error/empty).
- **Export Current View** disabled when no rows; downloads CSV when rows exist.

### `/admin/reconciliation`
- Renders snapshot counts + flagged table (or empty state).
- Refresh button works and shows progress state.

## Partner workflows

### `/partner`
- Renders partner summary from backend (no fake metrics).
- Links route to:
  - `/partner/subscriptions`
  - `/partner/commissions`
  - `/partner/reports`

### `/partner/customers`
- Search works and reloads list.
- Empty state shown when no rows.

### `/partner/subscriptions`
- List renders.
- Filters/search work (if present).

### `/partner/commissions`
- Commission ledger loads safely.

### `/partner/reports`
- Summary cards render (or safe error).
- Refresh works.

### `/partner/collections/create`
- Collection workflow renders and validates inputs.
- Submission handles backend errors safely.

## Customer workflows

### `/customer`
- Renders customer summary from backend (no fake metrics).
- Links route to:
  - `/customer/subscriptions`
  - `/customer/payments`

### `/customer/subscriptions`
- List loads; detail route works: `/customer/subscriptions/[id]`.

### `/customer/payments`
- Summary table renders.
- Export (if present) is safe/disabled when empty.
- Note about receipt visibility is present and accurate.

### `/customer/profile`
- Profile loads and shows identity + summary metrics.
- Handles errors safely.

## Cashier workflows

### `/cashier`
- Loads cashier summary (no fake metrics).
- Primary action routes to `/cashier/collect`.

### `/cashier/collect`
- Pending EMI lookup by phone works (or safe error).
- Collect payment posts to backend and shows safe success/error.

## Known backend-gated UI (expected limitations)

- Partner payouts list/detail (partner-scoped payouts endpoint not available).
- Partner customer detail page (partner-scoped customer detail endpoint not available).
- Customer analytics aggregates (backend aggregates/export not available).
- Cashier today transaction list is untyped; UI does not render it as a table yet.

