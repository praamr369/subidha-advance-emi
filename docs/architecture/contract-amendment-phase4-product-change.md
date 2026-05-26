# Contract Amendment Phase 4 Product Change

Status: implemented on `update`.

## Scope

Phase 4 implements only approved `PRODUCT_CHANGE` amendments where the change can be safely applied as a product-reference update.

The only operational contract field changed is:

```text
Subscription.product
```

The endpoint is reused:

```text
POST /api/v1/admin/contract-amendments/{id}/implement/
```

## Required conditions

Product change implementation requires:

- authenticated admin user
- amendment status `APPROVED`
- amendment type `PRODUCT_CHANGE`
- source contract type `EMI_SUBSCRIPTION` or `RENT_LEASE`
- source subscription/rent-lease contract exists
- source subscription is not terminal/cancelled/closed/completed/defaulted/returned/reversed
- approved product id is present, preferably `approved_product_id`
- target product exists
- target product is active and lifecycle-eligible
- target product is enabled for the source plan type when mode flags exist
- target product base price equals the locked contract `total_amount`

If target product price differs from the locked contract total, implementation is blocked because it would require price, EMI, or tenure recalculation.

## Preserved financial and operational truth

Phase 4 does not recalculate or mutate:

- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- EMI rows
- payments
- receipts
- lucky ID
- batch
- waiver rows
- commission records
- payout records
- accounting journals
- reconciliation records
- inventory records
- stock records
- delivery records
- rent/lease billing
- security deposit records
- cancellation records
- return records

## Audit behavior

Implementation is service-layer controlled, transaction-safe, and audited.

The service:

- locks the amendment row with `select_for_update()`
- locks the source subscription row before changing the product reference
- records old/new product data in `implemented_values`
- records financial invariant flags in `implemented_values`
- marks the amendment `IMPLEMENTED`
- records `implemented_by` and `implemented_at`
- emits `CONTRACT_AMENDMENT_IMPLEMENTED` with `phase = PHASE_4_PRODUCT_REFERENCE_CHANGE`

A second implementation attempt is rejected.

## Deferred phases

Phase 5 remains lucky ID / batch change only.

Phase 6 remains EMI, tenure, and price recalculation only.
