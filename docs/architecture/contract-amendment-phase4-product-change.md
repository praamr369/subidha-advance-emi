# Contract Amendment Phase 4 Product Reference Correction

Status: implemented on `update`.

## Scope correction

Phase 4 is not full financial product change.

Current Phase 4 supports only same-price product reference correction. This means the stored contract product reference can be corrected when the locked contract value remains unchanged.

The existing `PRODUCT_CHANGE` amendment type is retained for API and data compatibility, but in this phase it is interpreted as:

```text
PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY
```

The only operational contract field changed is:

```text
Subscription.product
```

The endpoint is reused:

```text
POST /api/v1/admin/contract-amendments/{id}/implement/
```

The legacy endpoint is also routed through the same guarded service:

```text
POST /api/v1/admin/contracts/amendments/{id}/apply/
```

The subscription lifecycle page does not call either implementation endpoint. Its amendment panel is read-only and may only link to `/admin/contract-amendments/{id}` for review or preview. Apply/execute wording is forbidden in that lifecycle panel.

## Required conditions

Same-price product reference correction requires:

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

If target product price differs from the locked contract total, implementation is blocked with this message:

```text
Financial product change requires contract repricing preview and reconciliation and is not implemented in this phase.
```

## Deferred true product change

A true product upgrade or downgrade is deferred. It requires a future financial amendment phase with:

- price difference calculation
- EMI recalculation preview
- paid amount allocation
- future EMI schedule changes
- receipt and payment treatment
- accounting entries
- reconciliation impact
- customer and admin approval
- audit trail

`PRODUCT_UPGRADE` is treated as financial product change semantics, not as same-price product reference correction. It is preview/future-recontract only and is not implemented through the legacy lifecycle apply route.

Payload keys that attempt financial product change are rejected, including `new_total_amount`, `total_amount`, `monthly_amount`, `emi_amount`, `tenure_months`, `price_difference`, `extra_amount`, `refund_amount`, `adjustment_amount`, `recalculation`, `payment_adjustment`, `accounting_adjustment`, and `reconciliation_adjustment`.

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

- locks only the amendment row first, avoiding nullable `select_related()` joins under `FOR UPDATE`
- locks the source subscription row separately before changing the product reference
- records old/new product data in `implemented_values`
- records `semantics = PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`
- records financial invariant flags in `implemented_values`
- marks the amendment `IMPLEMENTED`
- records `implemented_by` and `implemented_at`
- emits `CONTRACT_AMENDMENT_IMPLEMENTED` with `phase = PHASE_4_PRODUCT_REFERENCE_CORRECTION`

A second implementation attempt is rejected.

## Deferred phases

Phase 5 lucky ID / batch must wait until product-change financial semantics are settled.

Phase 6 remains EMI, tenure, and price recalculation only.
