# Contract Amendment Workflow

Status: Phase 1 request/review, Phase 2 UI, Phase 3 customer corrections, Phase 4 same-price product reference correction, product recontract preview, Phase 6A preview snapshot persistence, and Phase 6B customer consent are implemented on `update`.

## Scope

Contract amendments support EMI Subscription and Rent / Lease contracts. Direct Sale corrections stay in their existing billing, return, exchange, refund, cancellation, and invoice workflows.

## Phase 1 — Request and review foundation

Customer and partner users can request amendments for allowed linked contracts. Admin users can inspect, mark under review, approve, or reject. Approval records decision values but does not automatically mutate financial or operational records.

## Phase 2 — Role-scoped UI

Customer, partner, and admin amendment screens show request and review state. Customer and partner screens do not expose implementation or recontract preview controls.

The subscription lifecycle page is not an implementation surface. Its Contract Amendments panel is read-only and links to `/admin/contract-amendments/{id}` for review, preview, and any guarded detail-page action. Apply/execute wording is forbidden in the lifecycle amendment panel.

## Phase 3 — Low-risk implementation

Implemented only:

- `CONTACT_CORRECTION`: updates `Customer.phone`
- `ADDRESS_CHANGE`: updates `Customer.address` and `Customer.city`

This is admin-only, approval-required, audited, and idempotent.

## Phase 4 — Same-price product reference correction

The existing `PRODUCT_CHANGE` enum remains for compatibility, but current implementation is only `PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`.

It can update only `Subscription.product` when the target product base price equals the locked contract total. It does not recalculate price, EMI, tenure, payment, receipt, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

Different-price target products are blocked from implementation with a financial recontract message.

## Product recontract preview

Admin users can preview the financial impact of a true product recontract without applying it:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
```

The preview is backend-calculated. It returns old/new product, old/new contract total, price difference, amount already paid, old/proposed remaining balance, current/proposed EMI, pending EMI count, impact type, effective date preview, warnings, and `source_record_mutation = false`.

Impact types:

```text
UPGRADE_EXTRA_PAYABLE
DOWNGRADE_CREDIT_REQUIRED
SAME_PRICE_REFERENCE_CORRECTION
```

The preview does not mutate source records. Accounting and reconciliation posting are future work.

## Phase 6A — Product recontract preview snapshot persistence

Admin users can explicitly persist backend-calculated preview evidence:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

The save endpoint recalculates the preview on the backend and stores a `ContractRecontractEvent` snapshot. Prior active preview events for the same amendment are marked `SUPERSEDED`; retained history remains available through the events endpoint. Amendment metadata stores the latest preview event id for review convenience.

Phase 6A is audit evidence only. It does not change the real contract, EMI schedule, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records. Admin execution approval, future EMI schedule change, accounting posting, reconciliation, and printable addendum remain future phases.

Product upgrade/downgrade remains preview-only and future-recontract work. It must not be applied from the subscription lifecycle page.

## Phase 6B — Customer consent for saved preview snapshots

Customer users can view the latest active saved product recontract preview summary on their own amendment detail and record a consent decision:

```text
POST /api/v1/customer/contract-amendments/{id}/product-recontract/consent/
```

Allowed decisions are `ACCEPTED` and `REJECTED`, with an optional note. Consent is recorded on the latest active `PREVIEWED` `ContractRecontractEvent` only. A second consent attempt for the same snapshot is rejected. Superseded or cancelled snapshots cannot receive consent.

Phase 6B is consent evidence only. It does not mutate `Subscription.product`, contract totals, monthly EMI, tenure, EMI rows, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

Admin amendment detail shows customer consent status read-only. Admins cannot override or submit customer consent in this phase. Customer consent is required before future admin execution approval.

## Product recontract execution design

Current system supports preview and customer consent evidence only for financial product change. Execution is intentionally deferred until admin approval workflow, future EMI schedule adjustment service, accounting bridge, reconciliation event flow, and printable addendum are implemented.

The future execution design is documented in:

```text
docs/architecture/contract-amendment-product-recontract-execution-design.md
```

Financial product recontract execution must preserve historical payments, receipts, paid EMIs, waived EMIs, lucky draw evidence, accounting journals, reconciliation evidence, commission/payout records, delivery records, inventory records, rent/lease demands, and deposit records.

## Admin API inventory

```text
GET  /api/v1/admin/contract-amendments/
GET  /api/v1/admin/contract-amendments/{id}/
POST /api/v1/admin/contract-amendments/{id}/review/
POST /api/v1/admin/contract-amendments/{id}/approve/
POST /api/v1/admin/contract-amendments/{id}/reject/
POST /api/v1/admin/contract-amendments/{id}/implement/
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

## Customer API inventory

```text
GET  /api/v1/customer/contract-amendments/
GET  /api/v1/customer/contract-amendments/{id}/
POST /api/v1/customer/contract-amendments/{id}/product-recontract/consent/
```

Legacy apply remains routed through the guarded service:

```text
POST /api/v1/admin/contracts/amendments/{id}/apply/
```

## Deferred phases

True product recontract execution requires later phases covering admin execution approval, price difference approval, EMI recalculation preview approval, paid amount allocation, future EMI schedule generation, receipt/payment treatment, accounting entries, reconciliation impact, printable addendum, and audit trail.

Phase 5 lucky ID / batch work must wait until financial product-change semantics are settled.
