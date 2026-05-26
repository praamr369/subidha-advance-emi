# Contract Amendment Workflow

Status: **Phase 1 backend foundation implemented; Phase 2 UI stabilized; Phase 3 guarded customer corrections implemented; Phase 4 same-price product reference correction implemented on `update` branch**

## Scope

Contract amendments are limited to:

- EMI Subscription contracts.
- Rent / Lease contracts represented by RENT or LEASE subscriptions.

Direct Sale is explicitly excluded. Direct Sale corrections, returns, cancellations, refunds, exchanges, invoices, and billing corrections remain outside this workflow.

## Phase 1 boundary

Phase 1 is request/review/approval foundation only.

Implemented actions:

- Customer can request amendments for their own EMI or rent/lease contracts.
- Partner can request amendments for linked partner contracts only.
- Admin can list, inspect, move to review, approve, and reject requests.
- Rejection requires a rejection reason.
- Approval records `approved_values`, `approved_by`, and `approved_at` but does not automatically implement changes.

## Phase 2 UI boundary

Phase 2 adds role-scoped request/review UI only.

- Customer UI: list, create, and view own amendment requests.
- Partner UI: list, create, and view linked customer amendment requests.
- Admin UI: list, inspect, mark under review, approve decision, reject decision, and show guarded implementation metadata.

Admin approval remains separate from implementation. Implementation requires a separate admin-only action.

## Phase 3 boundary

Phase 3 implements only whitelisted non-financial corrections after an amendment is already `APPROVED`.

Implemented types:

- `CONTACT_CORRECTION`: updates `Customer.phone` only.
- `ADDRESS_CHANGE`: updates `Customer.address` and `Customer.city` only.

Implementation is admin-only, audited, idempotent, and records before/after field evidence in `implemented_values`. A second implementation attempt returns a controlled 400 and does not mutate again.

## Phase 4 boundary

Phase 4 is **same-price product reference correction only**. It is not full financial product upgrade/downgrade.

The existing `PRODUCT_CHANGE` enum remains for compatibility, but the current implementation treats it as:

```text
PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY
```

Implemented behavior:

- Updates only `Subscription.product` to the approved corrected product reference.
- Requires `approved_values.approved_product_id` or an accepted equivalent product id key.
- Requires amendment status `APPROVED`.
- Requires an eligible source EMI/rent/lease subscription.
- Requires the target product to be active and lifecycle-eligible.
- Requires the target product to be enabled for the source plan type when product mode flags exist.
- Requires the target product `base_price` to equal the locked source contract `total_amount`.
- Blocks different-price target products with: `Financial product change requires contract repricing preview and reconciliation and is not implemented in this phase.`
- Records old/new product reference evidence, same-price semantics, and financial invariants in `implemented_values`.
- Emits `CONTRACT_AMENDMENT_IMPLEMENTED` audit metadata with `phase = PHASE_4_PRODUCT_REFERENCE_CORRECTION`.

Phase 4 does **not** recalculate or mutate:

- total price
- EMI amount
- tenure
- paid amount
- EMI rows
- payment records
- receipt documents
- lucky ID
- batch
- waiver rows
- commission or payout records
- accounting journals
- reconciliation records
- rent/lease monthly demand
- security deposit records
- inventory or stock records
- delivery records

True product change is deferred. It must include price difference, EMI recalculation preview, paid amount allocation, future EMI schedule change, receipt/payment treatment, accounting entries, reconciliation impact, customer/admin approval, and audit trail.

## Data model

The existing legacy `contract_amendments` table is extended additively for compatibility. Legacy fields remain available for older admin contract lifecycle routes.

Important fields include:

- `amendment_no`
- `contract_type`
- `subscription`
- `rent_lease_contract`
- `customer`
- `partner`
- `requested_by`
- `requested_role`
- `amendment_type`
- `status`
- `old_values`
- `requested_values`
- `approved_values`
- `implemented_values`
- `reason`
- `admin_note`
- `rejection_reason`
- review flags for EMI, inventory, lucky ID, accounting, and rent/lease review
- `effective_date`
- approval and implementation metadata
- `metadata`
- timestamps

No Phase 4 migration is required because product reference correction uses existing amendment and subscription fields.

## Contract type rules

- `EMI_SUBSCRIPTION` requires exactly one `subscription` source and that source must be an EMI subscription.
- `RENT_LEASE` requires exactly one `rent_lease_contract` source and that source must be RENT or LEASE.
- Direct Sale has no model field and is impossible through serializers and service validation.

## API inventory

Customer:

```text
GET  /api/v1/customer/contract-amendments/
POST /api/v1/customer/contract-amendments/
GET  /api/v1/customer/contract-amendments/{id}/
```

Partner:

```text
GET  /api/v1/partner/contract-amendments/
POST /api/v1/partner/contract-amendments/
GET  /api/v1/partner/contract-amendments/{id}/
```

Admin:

```text
GET  /api/v1/admin/contract-amendments/
GET  /api/v1/admin/contract-amendments/{id}/
POST /api/v1/admin/contract-amendments/{id}/review/
POST /api/v1/admin/contract-amendments/{id}/approve/
POST /api/v1/admin/contract-amendments/{id}/reject/
POST /api/v1/admin/contract-amendments/{id}/implement/
```

Legacy admin apply route remains supported by the same guarded service and must never 500 on nullable rent/lease joins:

```text
POST /api/v1/admin/contracts/amendments/{id}/apply/
```

The implement/apply service dispatches by amendment type:

- Phase 3 customer field corrections.
- Phase 4 same-price product reference corrections.

Customer and partner serializers expose state only; they do not expose implementation actions.

## Integrity rules

Phase 1 and Phase 2 never mutate source contracts or posted financial records. Phase 3 mutates only whitelisted customer display/contact fields. Phase 4 mutates only `Subscription.product` after strict approval, eligibility, same-price, and financial-invariant guards.

They do not change:

- EMI schedules.
- Payment history.
- Receipt documents.
- Accounting journals.
- Lucky draw records.
- Winner or waiver state.
- Rent/lease billing demands.
- Deposit liability records.
- Inventory or delivery state.
- Commission or payout records.
- Direct Sale records.

## Auditability

Each request captures an immutable source snapshot in `old_values`. Customer/partner requested changes are stored in `requested_values`. Admin approval stores `approved_values` separately. Rejection stores `rejection_reason`.

Audit log entries are emitted for request, approval, rejection, Phase 3 implementation, and Phase 4 product reference correction. Phase 4 captures old product, new product, unchanged financial terms, preserved-field list, source model, source id, and audit metadata.

## Deferred phases

- Phase 5: Lucky ID / Batch change implementation only. This must wait until product-change financial semantics are settled.
- Phase 6: Future financial obligation recalculation only.
