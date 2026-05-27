# Contract Amendment Implementation Plan

Status: **Phase 6E product recontract accounting/reconciliation impact preview evidence completed on `update` branch**

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

Status: **Implemented**

Additive model work only. `ContractRecontractEvent` persists backend-calculated preview snapshots without mutating subscription, EMI, payment, receipt, accounting, reconciliation, inventory, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

Admin endpoints:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

The existing preview endpoint remains calculation-only. The save endpoint recalculates and stores a READY backend snapshot as audit evidence. Prior active previews for the same amendment are marked `SUPERSEDED`, not deleted.

Customer consent is handled in Phase 6B and admin decision recording is handled in Phase 6C. Future EMI schedule change, accounting posting, reconciliation, execution endpoint, and printable addendum remain future phases. Full execution remains blocked.

## Phase 6B — Customer consent UI

Status: **Implemented**

Customer sees the latest active saved backend-calculated preview summary for their own amendment and accepts or rejects it with an optional note:

```text
POST /api/v1/customer/contract-amendments/{id}/product-recontract/consent/
```

Consent is recorded only on the saved `ContractRecontractEvent` snapshot. It is required before Phase 6C admin approval/rejection. It does not mutate subscription product, total amount, monthly amount, tenure, EMI rows, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records.

Admin detail shows customer consent status read-only. Customer consent is required before Phase 6C admin approval/rejection. Future EMI schedule update, accounting/reconciliation integration, printable addendum, and execution remain future phases.

## Phase 6C — Admin approval workflow

Status: **Implemented**

Admin can record `APPROVED` or `REJECTED` against the latest active saved product recontract preview only after customer consent is `ACCEPTED`:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/admin-decision/
```

This is a decision record only. It stores admin approval status, actor, timestamp, note, and approval snapshot on `ContractRecontractEvent`. It rejects missing saved previews, customer consent `PENDING`, customer consent `REJECTED`, superseded/cancelled previews, and repeated admin decisions.

Phase 6C does not mutate subscription product, total amount, monthly amount, tenure, EMI rows, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records. No execution endpoint or execution button is added.

Future EMI schedule update, accounting/reconciliation integration, product recontract execution endpoint, and printable addendum remain future phases.

## Phase 6D — Future EMI schedule adjustment preview model only

Status: **Implemented**

Additive `ContractRecontractScheduleLine` persists backend-calculated preview-only future EMI lines for latest recontract event when:
- event status is `PREVIEWED`
- customer consent is `ACCEPTED`
- admin approval is `APPROVED`

Admin endpoints:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
```

Phase 6D does not mutate `Emi` rows, `Subscription.product`, `Subscription.total_amount`, `Subscription.monthly_amount`, `Subscription.tenure_months`, payments, receipts, accounting, or reconciliation. It is preview evidence only; execution remains deferred.

## Phase 6E — Accounting/reconciliation impact preview evidence only

Status: **Implemented**

Additive `ContractRecontractFinancialImpactPreview` persists backend-generated accounting and reconciliation impact preview evidence for latest recontract preview events after customer acceptance, admin approval, and schedule preview lines.

Admin endpoints:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
```

Phase 6E does not post journals, does not mutate finance account balances, does not create reconciliation items/settlements, and does not execute recontract changes. Execution remains future work.

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
