# Contract Amendment Implementation Plan

Status: **Phase 4 same-price product reference correction completed on `update` branch**

## Principle

Implement one controlled phase at a time. Do not move to the next phase until the previous phase is reviewed, committed, migrated, and tested.

The amendment workflow is limited to EMI Subscription contracts and Rent / Lease contracts. Direct Sale amendments are explicitly out of scope.

## Phase 1 — Backend foundation

Status: **Implemented**

Goal:

- Add an auditable amendment register.
- Allow customer and partner amendment requests.
- Allow admin review, approval, and rejection.
- Do not implement or mutate contract terms.

Integrity notes:

- Existing legacy amendment rows remain compatible.
- Source contracts are not mutated during request/review/approval.
- Posted payments, receipts, journals, EMI rows, waivers, lucky draw records, inventory, settlement, commissions, and payouts are not changed.

## Phase 2 — UI only

Status: **Implemented**

Routes:

- `/customer/contract-amendments`
- `/customer/contract-amendments/new`
- `/customer/contract-amendments/[id]`
- `/partner/contract-amendments`
- `/partner/contract-amendments/new`
- `/partner/contract-amendments/[id]`
- `/admin/contract-amendments`
- `/admin/contract-amendments/[id]`

## Phase 3 — Low-risk implementation only

Status: **Implemented**

Implemented source fields:

- `ADDRESS_CHANGE`: `Customer.address`, `Customer.city`
- `CONTACT_CORRECTION`: `Customer.phone`

Implementation requires admin approval first, runs through `POST /api/v1/admin/contract-amendments/{id}/implement/`, records `implemented_values`, sets implementation metadata, and emits `CONTRACT_AMENDMENT_IMPLEMENTED`.

Phase 3 does not mutate subscriptions, EMI rows, payments, receipts, journals, waivers, lucky draw records, rent/lease billing demands, deposit records, inventory, stock, reconciliation records, commission records, or payout records.

## Phase 4 — Same-price product reference correction only

Status: **Implemented**

The existing `PRODUCT_CHANGE` enum remains for compatibility, but the current behavior is only `PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`.

Implemented behavior:

- Updates only `Subscription.product`.
- Implementation is admin-only and approval-required.
- Implementation runs through `POST /api/v1/admin/contract-amendments/{id}/implement/`.
- Legacy `POST /api/v1/admin/contracts/amendments/{id}/apply/` delegates to the same safe service.
- The amendment row is locked without nullable `select_related()` joins.
- The source subscription is locked separately before mutation.
- `implemented_values` captures old/new product data, semantic classification, and financial invariant flags.
- `CONTRACT_AMENDMENT_IMPLEMENTED` is emitted with `phase = PHASE_4_PRODUCT_REFERENCE_CORRECTION`.

Preserved fields and workflows:

- `total_amount`
- `monthly_amount`
- tenure
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
- deposit records
- cancellation records
- return records

Financial product upgrade/downgrade is blocked. A target product with a different base price is rejected with: `Financial product change requires contract repricing preview and reconciliation and is not implemented in this phase.`

A future true product-change phase must include price difference, EMI recalculation preview, paid amount allocation, future EMI schedule change, receipt/payment treatment, accounting entries, reconciliation impact, customer/admin approval, and audit trail.

## Phase 5 — Lucky ID / Batch change only

Status: **Deferred**

Phase 5 must wait until product-change financial semantics are settled.

## Phase 6 — Future financial obligation recalculation

Status: **Deferred**

Paid EMIs, posted payments, receipts, journals, winner/waiver history, and past rent/lease payments remain immutable.

## Required validation after each phase

Backend phases:

```text
cd backend
../.venv/bin/python manage.py makemigrations --check --dry-run
../.venv/bin/python manage.py migrate --plan
../.venv/bin/python manage.py migrate
../.venv/bin/python manage.py check
../.venv/bin/python manage.py test subscriptions api
```

Frontend phases:

```text
cd frontend
npm run lint
npm run typecheck
npm run build
npm run check:routes
```

Do not run full release candidate scripts during amendment phase work unless explicitly requested.
