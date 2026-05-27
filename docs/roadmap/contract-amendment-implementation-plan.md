# Contract Amendment Implementation Plan

Status: **Phase 6F product recontract execution endpoint is present but blocked on `update` branch; Phase 6F.1 posting integration design is documented**

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

## Blocked true product recontract execution

A future implementation phase must handle price difference approval, paid amount allocation, receipt/payment treatment, durable accounting entries, durable reconciliation evidence or queue records, printable addendum, and audit trail.

Current system supports preview, consent/approval evidence, schedule preview evidence, financial impact preview evidence, and a blocked execution endpoint for financial product change. Execution source mutation is intentionally disabled until accounting and reconciliation posting integration is implemented.

## Phase 6A — Product recontract data model + preview snapshot persistence

Status: **Implemented**

Additive model work only. `ContractRecontractEvent` persists backend-calculated preview snapshots without mutating subscription, EMI, payment, receipt, accounting, reconciliation, inventory, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

Admin endpoints:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

The existing preview endpoint remains calculation-only. The save endpoint recalculates and stores a READY backend snapshot as audit evidence. Prior active previews for the same amendment are marked `SUPERSEDED`, not deleted.

Customer consent is handled in Phase 6B and admin decision recording is handled in Phase 6C. Schedule preview, financial impact preview, and a blocked execution endpoint are handled in later phases. Accounting posting, reconciliation posting, real source mutation, and printable addendum remain future phases. Full execution remains blocked.

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

Phase 6D does not mutate `Emi` rows, `Subscription.product`, `Subscription.total_amount`, `Subscription.monthly_amount`, `Subscription.tenure_months`, payments, receipts, accounting, or reconciliation. It is preview evidence only.

## Phase 6E — Accounting/reconciliation impact preview evidence only

Status: **Implemented**

Additive `ContractRecontractFinancialImpactPreview` persists backend-generated accounting and reconciliation impact preview evidence for latest recontract preview events after customer acceptance, admin approval, and schedule preview lines.

Admin endpoints:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
```

Phase 6E does not post journals, does not mutate finance account balances, does not create reconciliation items/settlements, and does not execute recontract changes.

## Phase 6F — Product recontract execution endpoint

Status: **Blocked pending accounting/reconciliation posting integration**

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

The endpoint is admin-only and keeps the execution gates testable, but it intentionally returns controlled 400:

```text
Product recontract execution requires accounting and reconciliation posting integration and is not enabled yet.
```

It uses `transaction.atomic()`, locks the amendment/event/subscription/pending EMI path, validates latest `PREVIEWED` event, accepted customer consent, approved admin decision, schedule preview lines, financial impact preview statuses, and duplicate-execution metadata before blocking.

No execution button is exposed in the frontend. Do not enable this endpoint until durable accounting evidence and durable reconciliation evidence or queue records are created in the same transaction as any subscription or pending EMI mutation.

## Phase 6F.1 — Product recontract posting integration design

Status: **Implemented as documentation only**

Design document:

```text
docs/architecture/product-recontract-posting-integration-design.md
```

This phase defines the required posting integration for real product upgrade/downgrade execution. It does not enable execution and does not mutate subscription, EMI, payment, receipt, accounting, reconciliation, settlement/day-close, inventory, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records.

Design decisions:

- Upgrade creates additional receivable / contract increase.
- Downgrade reduces unpaid receivable first and creates customer credit liability for any overpaid amount.
- Refund is separate and controlled; recontract execution does not create refund payment or receipt records.
- Already paid amount, historical payments, historical receipts, paid EMIs, posted journals, waiver history, and draw history remain preserved.
- No cash movement occurs at recontract execution.
- Posting must go through accounting services, preferably idempotent accounting bridge posting.
- Reconciliation must create durable lifecycle/reconciliation evidence and must not mutate settlement/day-close records.
- Execution must roll back if accounting posting, reconciliation evidence creation, or pending EMI mutation fails.

Future additive implementation records are recommended:

- `ContractRecontractPostingRecord`
- `ContractRecontractReconciliationRecord`

Execution remains blocked until Phase 6F.2, Phase 6F.3, and Phase 6F.4 are implemented and tested.

## Phase 6F.2 — Durable accounting posting preview-to-record bridge

Status: **Deferred**

Add durable posting records and accounting service integration:

- create additive `ContractRecontractPostingRecord`
- validate posting profile/chart-account readiness
- validate accounting period and posting lock
- post upgrade/downgrade journal through accounting bridge services only
- store bridge/journal/group references
- keep execution endpoint blocked

Required tests:

- upgrade posting creates journal evidence
- downgrade posting creates receivable reduction/customer credit evidence
- accounting failure leaves subscription, EMI, payment, receipt, and preview state unchanged
- no direct finance account balance mutation occurs outside accounting service boundaries

## Phase 6F.3 — Durable reconciliation queue/lifecycle integration

Status: **Deferred**

Add durable reconciliation evidence:

- create additive `ContractRecontractReconciliationRecord`
- create/link `FinancialSourceLifecycleEvent` or equivalent durable source event
- link recontract event, financial impact preview, accounting bridge posting, journal entry, subscription, expected amount, and actual amount
- keep old payments reconciled as-is
- keep settlement/day-close records unchanged
- keep execution endpoint blocked

Required tests:

- reconciliation evidence is created for upgrade and downgrade adjustment
- adjustment amount reconciles to accounting posting amount
- reconciliation failure rolls back before subscription/EMI mutation
- day-close and settlement records are unaffected

## Phase 6F.4 — Enable product recontract execution with posting integration

Status: **Deferred**

Only after Phase 6F.2 and Phase 6F.3 are implemented:

- execute inside one transaction
- lock amendment, event, subscription, financial preview, schedule preview lines, and pending EMIs
- post accounting evidence
- create reconciliation evidence
- mutate subscription and pending EMIs from preview lines
- mark recontract event executed with audit snapshot
- preserve historical payment, receipt, paid EMI, waiver, draw, commission, payout, settlement/day-close, rent/lease demand, and deposit records

Required tests:

- paid EMIs and receipts unchanged
- pending EMIs updated only from preview
- customer ledger shows old contract, payments received, recontract adjustment, new remaining balance, and future schedule
- duplicate execution is idempotent
- all failure paths roll back or compensate through services

## Phase 6F.5 — Product recontract RC hardening

Status: **Deferred**

Before production rollout:

- period-lock and posting-lock failure injection tests
- duplicate request/race-condition tests
- operational cancellation/reversal/dispute conflict tests
- ledger/customer account display tests
- reconciliation runner regression tests
- frontend execution control only after backend readiness is explicit

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
