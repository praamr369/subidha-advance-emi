# Contract Amendment Phase 3 Implementation

Status: implemented on `update`.

## Scope

Phase 3 implements only whitelisted non-financial corrections after admin approval.

Implemented whitelist:

- `CONTACT_CORRECTION` updates `Customer.phone` only.
- `ADDRESS_CHANGE` updates `Customer.address` and `Customer.city` only.

Implementation requires:

- authenticated admin user
- amendment status `APPROVED`
- amendment type in the Phase 3 whitelist
- approved/requested value keys matching the whitelisted target fields

The endpoint is:

```text
POST /api/v1/admin/contract-amendments/{id}/implement/
```

Customer and partner routes do not expose implementation.

## Audit and idempotency

Implementation runs in the service layer inside `transaction.atomic()` and locks the amendment row with `select_for_update()` before mutating the source customer row.

The service records before/after evidence in `implemented_values`, sets `implemented_by` and `implemented_at`, moves status to `IMPLEMENTED`, and emits `CONTRACT_AMENDMENT_IMPLEMENTED`.

A second implementation attempt returns a controlled 400 and does not mutate the source record again.

## Blocked amendments

Financial and contract-value amendments remain blocked and require future phases:

- product
- lucky ID
- batch
- EMI
- tenure
- price
- payment
- waiver
- rent/lease billing
- deposit
- accounting
- reconciliation
- inventory
- commission
- payout
- delivery/stock

Phase 3 does not mutate subscriptions, EMI rows, payments, receipts, journals, waivers, lucky draw records, rent/lease billing demands, deposit records, inventory, stock, reconciliation records, commission records, or payout records.
