# Contract Amendment Implementation Plan

Status: **Phase 4 same-price product reference correction and product recontract preview completed on `update` branch**

## Principle

Implement one controlled phase at a time. Do not move to the next phase until the previous phase is reviewed, committed, migrated, and tested.

The amendment workflow is limited to EMI Subscription contracts and Rent / Lease contracts. Direct Sale amendments remain out of scope.

## Phase 1 — Backend foundation

Status: **Implemented**

Customer and partner users can request amendments for allowed contracts. Admin users can review, approve, and reject requests. Approval does not automatically mutate financial or operational records.

## Phase 2 — UI only

Status: **Implemented**

Customer, partner, and admin routes expose role-scoped amendment registers and detail pages. Customer and partner screens do not expose implementation or recontract preview controls.

The subscription lifecycle amendment panel is read-only. It links to amendment detail and must not expose Apply, execute, update-contract, or implementation wording/actions.

## Phase 3 — Low-risk implementation only

Status: **Implemented**

Implemented source fields:

- `ADDRESS_CHANGE`: `Customer.address`, `Customer.city`
- `CONTACT_CORRECTION`: `Customer.phone`

Phase 3 does not mutate subscriptions, EMI rows, payments, receipts, journals, waivers, lucky draw records, rent/lease billing demands, deposits, inventory, stock, reconciliation records, commission records, or payout records.

## Phase 4 — Same-price product reference correction only

Status: **Implemented**

The existing `PRODUCT_CHANGE` enum remains for compatibility, but implementation behavior is only `PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`.

Implemented behavior:

- Updates only `Subscription.product`.
- Requires admin approval.
- Runs through `POST /api/v1/admin/contract-amendments/{id}/implement/`.
- Legacy `POST /api/v1/admin/contracts/amendments/{id}/apply/` delegates to the same guarded service.
- Blocks different-price target products from execution.

## Product recontract preview — Preview only

Status: **Implemented**

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
```

This endpoint is backend-calculated and read-only. It returns old/new product, old/new contract total, price difference, amount already paid, old/proposed remaining balance, current/proposed EMI, pending EMI count, effective date preview, impact type, and warnings.

Impact types:

```text
UPGRADE_EXTRA_PAYABLE
DOWNGRADE_CREDIT_REQUIRED
SAME_PRICE_REFERENCE_CORRECTION
```

The preview does not mutate subscription product, total amount, monthly amount, tenure, EMI rows, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records.

Product upgrade/downgrade is preview/future-recontract only. The lifecycle page is not the execution surface; admins must open `/admin/contract-amendments/{id}` for review or preview.

## Deferred true product recontract execution

A future implementation phase must handle price difference approval, EMI recalculation preview approval, paid amount allocation, future EMI schedule generation, receipt/payment treatment, accounting entries, reconciliation impact, customer/admin approval evidence, and audit trail.

Current system supports preview only for financial product change. Execution is intentionally deferred until the model/workflow in `docs/architecture/contract-amendment-product-recontract-execution-design.md` is implemented.

## Phase 6A — Product recontract data model + preview snapshot persistence

Status: **Deferred**

Additive model work only. Persist preview snapshots and old/new schedule previews without mutating subscription, EMI, payment, receipt, accounting, reconciliation, inventory, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

## Phase 6B — Customer consent UI

Status: **Deferred**

Customer sees backend-calculated old/new terms and accepts or rejects. No source mutation.

## Phase 6C — Admin approval workflow

Status: **Deferred**

Admin reviews customer consent, stale preview status, eligibility guards, accounting preview, and reconciliation preview. No source mutation.

## Phase 6D — Future EMI schedule adjustment service

Status: **Deferred**

Create the controlled service for future EMI schedule changes from the effective date only. Historical paid and waived EMIs remain unchanged.

## Phase 6E — Accounting/reconciliation integration

Status: **Deferred**

Route execution impact through existing accounting services and reconciliation lifecycle/event services. Preview, consent, and approval must not post journals or reconciliation rows.

## Phase 6F — Product recontract execution endpoint

Status: **Deferred**

Future admin-only endpoint after all guards, models, tests, and downstream integrations exist. Do not expose an execution button before this phase.

## Phase 6G — Printable recontract addendum

Status: **Deferred**

Generate printable customer/admin agreement evidence from persisted execution snapshots.

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
