# Customer 360 Operational Cockpit

Branch: `update`

Status: **Phase 7E implementation contract**

## Purpose

Customer 360 is the admin-facing operational cockpit for one customer. It keeps customer identity, KYC/access handoff, Lucky Plan subscriptions, indexed contract references, direct-sale exposure, payments, receipts, invoices, documents, lead context, partner linkage, and collection routing visible from the existing admin customer detail route.

This phase improves daily shop usability without creating a new financial workflow or changing posting rules.

## Primary route

```text
/admin/customers/:id
```

The existing customer detail route is the Customer 360 route. Do not create a duplicate customer cockpit route unless a later migration explicitly deprecates the current route.

## Backend read surfaces

The page is backed by existing admin-only endpoints:

```text
GET /api/v1/admin/customers/:id/
GET /api/v1/admin/customers/:id/operational-profile/
GET /api/v1/admin/subscriptions/?customer=:id
GET /api/v1/admin/payments/?customer=:id
GET /api/v1/admin/customers/:id/kyc-documents/
```

`operational-profile/` is the current broad Customer 360 data surface. It returns server-side operational data and avoids calculating authoritative money totals in the frontend.

The existing service layer also contains a compact operational-summary builder. A separate `operational-summary/` endpoint should be added only if a future UI needs a smaller payload. Until then, the current cockpit should continue using the richer `operational-profile/` response.

## Admin-only behavior

Customer 360 is admin-only.

Admin users may inspect:

- customer profile and contact details
- KYC state and existing KYC document review records
- access handoff posture
- active and historical subscription context
- Advance EMI, rent, lease, and direct-sale contract references
- payment history
- direct-sale bills and active outstanding posture
- receipts, invoices, and uploaded subscription documents
- lead, quotation, estimate, and partner linkage context

Customer, partner, cashier, and vendor users must not receive this admin route in navigation or receive the admin customer payload.

## Existing approved actions

The route may link to or use existing approved workflows only:

- edit customer profile
- open subscriptions filtered by customer
- open payment register filtered by customer
- open collections filtered by customer
- create a subscription with customer prefill
- open direct-sale workspace filtered by customer
- open existing collection workflow for a collectible EMI or direct-sale balance
- review KYC documents through existing admin KYC endpoints
- start the existing OTP reset flow when an email reset identifier is available

The cockpit must not add fake buttons such as `Generate receipt`, `Post journal`, `Reconcile now`, or `Collect rent/lease` unless those workflows already exist as approved backend endpoints and route builders.

## Financial posture rules

Financial values shown in Customer 360 must come from backend payloads or existing source records.

The frontend may format money for display, but it must not become the authority for:

- EMI due amount
- overdue amount
- direct-sale balance
- rent/lease due amount
- payment totals
- receipt totals
- invoice outstanding totals
- waiver exposure
- reconciliation totals

If the backend does not expose a value, the UI should show `Not exposed`, `Not available`, or an empty state instead of inventing a value.

## Collection shortcut rules

Collection shortcuts are allowed only when they navigate to existing safe collection workflows.

Allowed examples:

```text
/admin/collections?customer=:id
/admin/finance/collect?subscription=:subscription_id
/admin/finance/collect?workflow=direct-sale&sale_id=:sale_id
```

Rent/lease collection remains view-only unless a production-approved rent/lease collection endpoint exists.

## Documents and print links

Customer 360 may surface document IDs and links only when existing document routes exist.

Safe print/navigation examples:

```text
/admin/subscriptions/:id/contract/print
/admin/billing/receipts/:id/print
/admin/contract-amendments/:id/recontract-addendum/print
/admin/customers/:id/statement/print
```

Do not generate fake documents from the Customer 360 page.

## Amendment and recontract visibility

The cockpit should display amendment and product-recontract status when backend data is available through existing amendment endpoints or reports.

Recommended rows:

- amendment number
- amendment type
- contract type
- status
- requested role
- subscription number
- customer consent status for product recontract
- admin approval status for product recontract
- executed state
- addendum print link only when executed and eligible

Execution must remain evidence-gated in the existing amendment workflow. Customer 360 should link to amendment detail; it should not duplicate execution logic.

## Delivery and service visibility

Delivery and service rows should be read-only in Customer 360.

Recommended rows:

- subscription delivery reference
- delivery status
- scheduled/delivered dates
- service ticket category/status
- latest update or resolution summary

Any delivery/service action must route to the existing delivery or service desk workflow.

## Timeline / audit behavior

Customer 360 may show a timeline only from backend-exposed records, such as:

- subscriptions
- payments
- direct sales
- receipts
- invoices
- KYC review events
- amendments/recontract events
- delivery/service events

No synthetic audit events should be created for display. Read-only viewing should not write audit records except where an existing endpoint intentionally audits a sensitive file download.

## Existing data impact

No schema migration is required for the current Customer 360 route.

No customer, subscription, EMI, payment, receipt, accounting, reconciliation, settlement, inventory, delivery, commission, payout, rent/lease, lucky draw, Lucky ID, batch, amendment, or recontract record is mutated by the read-only cockpit display.

## Financial integrity impact

Financial integrity is preserved because the cockpit reads server-side totals and routes money-changing work to existing collection, billing, amendment, and reconciliation workflows.

The page must not weaken finance account posting-readiness controls, EMI posting rules, receipt validity, reconciliation state, waiver rules, commission rules, or payout rules.

## Auditability impact

Auditability improves because the admin can inspect customer-linked operational context from one place without mixing source ledgers.

Historical/cancelled records remain visible for audit and should not be hidden from the cockpit, but they must be clearly separated from active receivables.

## Daily shop usability impact

Customer 360 reduces operator switching during counter work:

- customer identity and KYC/access context are visible first
- active contracts and dues are visible near collection shortcuts
- direct-sale and subscription workflows stay separate but visible together
- receipts/invoices/documents are visible without opening multiple registers first
- fallback warnings make partial backend data obvious

## Future rent/lease compatibility

Rent and lease should remain first-class contract reference categories in Customer 360.

Until rent/lease collection is fully approved, the cockpit should show rent/lease visibility and disabled guidance rather than fake collection actions. This preserves forward compatibility for a future rental/leasing app without breaking Lucky Plan EMI data.

## Test expectations

Frontend tests should cover:

- Customer 360 loads with mocked admin data
- key cockpit sections are visible
- subscription link is visible
- payment/receipt sections handle empty data
- no fake receipt or posting action is visible
- partial operational-profile failure shows a warning instead of breaking the page

Backend tests are required only if a new backend endpoint is added. The current implementation uses existing read endpoints.

## Validation commands

Frontend:

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
npm run check:routes
npx playwright test tests/e2e/customer_360.spec.ts --project=chromium-smoke --timeout=180000
```

Backend is not required for this documentation/test-only pass. If a backend endpoint is added later, run:

```bash
cd backend
../.venv/bin/python manage.py makemigrations --check --dry-run
../.venv/bin/python manage.py check
../.venv/bin/python manage.py test tests.api.test_customer_operational_summary -v 2
```

Do not run:

```bash
bash scripts/run-release-candidate.sh
```
