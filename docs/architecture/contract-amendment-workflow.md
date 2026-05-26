# Contract Amendment Workflow

Status: Phase 1 request/review, Phase 2 UI, Phase 3 customer corrections, Phase 4 same-price product reference correction, and product recontract preview are implemented on `update`.

## Scope

Contract amendments support EMI Subscription and Rent / Lease contracts. Direct Sale corrections stay in their existing billing, return, exchange, refund, cancellation, and invoice workflows.

## Phase 1 — Request and review foundation

Customer and partner users can request amendments for allowed linked contracts. Admin users can inspect, mark under review, approve, or reject. Approval records decision values but does not automatically mutate financial or operational records.

## Phase 2 — Role-scoped UI

Customer, partner, and admin amendment screens show request and review state. Customer and partner screens do not expose implementation or recontract preview controls.

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

## Admin API inventory

```text
GET  /api/v1/admin/contract-amendments/
GET  /api/v1/admin/contract-amendments/{id}/
POST /api/v1/admin/contract-amendments/{id}/review/
POST /api/v1/admin/contract-amendments/{id}/approve/
POST /api/v1/admin/contract-amendments/{id}/reject/
POST /api/v1/admin/contract-amendments/{id}/implement/
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
```

Legacy apply remains routed through the guarded service:

```text
POST /api/v1/admin/contracts/amendments/{id}/apply/
```

## Deferred phases

True product recontract execution requires a later financial implementation phase covering price difference approval, EMI recalculation preview approval, paid amount allocation, future EMI schedule generation, receipt/payment treatment, accounting entries, reconciliation impact, customer/admin approval evidence, and audit trail.

Phase 5 lucky ID / batch work must wait until financial product-change semantics are settled.
