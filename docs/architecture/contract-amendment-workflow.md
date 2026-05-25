# Contract Amendment Workflow

Status: **Phase 1 backend foundation implemented on `update` branch**

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
- Approval records `approved_values`, `approved_by`, and `approved_at` but does not implement changes.

Not implemented in Phase 1:

- No implement endpoint.
- No product change execution.
- No lucky ID or batch change execution.
- No future EMI or rent/lease schedule recalculation.
- No Direct Sale amendment support.

## Data model

The existing legacy `contract_amendments` table is extended additively for Phase 1 compatibility. Legacy fields remain available for older admin contract lifecycle routes.

Phase 1 fields include:

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

## Contract type rules

- `EMI_SUBSCRIPTION` requires exactly one `subscription` source and that source must be an EMI subscription.
- `RENT_LEASE` requires exactly one `rent_lease_contract` source and that source must be RENT or LEASE.
- Direct Sale has no model field and is impossible through the Phase 1 serializers and service validation.

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
```

## Integrity rules

Phase 1 never mutates source contracts or posted financial records.

It does not change:

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

The legacy admin `apply_amendment` service path is intentionally blocked in Phase 1 so implementation cannot occur accidentally before later controlled phases.

## Auditability

Each request captures an immutable source snapshot in `old_values`. Customer/partner requested changes are stored in `requested_values`. Admin approval stores `approved_values` separately. Rejection stores `rejection_reason`.

Audit log entries are emitted for request, approval, and rejection. Implementation values remain empty until later phases.

## Deferred phases

- Phase 2: Customer, partner, and admin UI only.
- Phase 3: Low-risk implementation actions only.
- Phase 4: Product change implementation only.
- Phase 5: Lucky ID / Batch change implementation only.
- Phase 6: Future financial obligation recalculation only.
