# Contract Amendment Implementation Plan

Status: **Phase 1 implemented on `update` branch**

## Principle

Implement one controlled phase at a time. Do not move to the next phase until the previous phase is reviewed, committed, migrated, and tested.

The amendment workflow is limited to:

- EMI Subscription contracts.
- Rent / Lease contracts.

Direct Sale amendments are explicitly out of scope. Direct Sale corrections, invoice corrections, return, exchange, refund, cancellation, and billing workflows remain governed by their existing modules.

## Phase 1 — Backend foundation

Status: **Implemented**

Goal:

- Add an auditable amendment register.
- Allow customer and partner amendment requests.
- Allow admin review, approval, and rejection.
- Do not implement or mutate contract terms.

Implemented:

- Extended existing `contract_amendments` table additively.
- Added Phase 1 fields including contract type, source contract, customer, partner, request/review values, review flags, approval metadata, and implementation placeholders.
- Added customer-scoped APIs.
- Added partner-scoped APIs.
- Added admin review/approve/reject APIs.
- Blocked implementation/apply behavior in Phase 1.

Integrity notes:

- Existing legacy amendment rows remain compatible.
- Source contracts are not mutated.
- Posted payments, receipts, journals, EMI rows, waivers, lucky draw records, inventory, settlement, commissions, and payouts are not changed.

## Phase 2 — UI only

Status: **Next phase**

Goal:

- Add customer, partner, and admin amendment register/detail/request UI.
- No contract mutation.
- Admin subscription lifecycle page should show review/register wording, not admin-as-requester wording.

Planned routes:

- `/customer/contract-amendments`
- `/customer/contract-amendments/new`
- `/customer/contract-amendments/[id]`
- `/partner/contract-amendments`
- `/partner/contract-amendments/new`
- `/partner/contract-amendments/[id]`
- `/admin/contract-amendments`
- `/admin/contract-amendments/[id]`

## Phase 3 — Low-risk implementation only

Status: **Deferred**

Allowed types only:

- `ADDRESS_CHANGE`
- `CONTACT_CORRECTION`
- `LEGAL_DOCUMENT_CORRECTION`
- `SCHEDULE_CORRECTION` only when no financial date/amount recalculation is required
- `OTHER` only when admin marks no financial, inventory, lucky-draw, rent/lease, or accounting impact

High-risk amendments remain blocked.

## Phase 4 — Product change implementation only

Status: **Deferred**

Scope:

- EMI subscription product change.
- Rent/lease asset or product change.

No automatic financial recalculation or inventory movement unless a safe approved service exists.

## Phase 5 — Lucky ID / Batch change only

Status: **Deferred**

Scope:

- EMI subscription only.
- Rent/lease and Direct Sale blocked.

Draw history, winner history, waivers, payments, receipts, and journals remain immutable.

## Phase 6 — Future financial obligation recalculation

Status: **Deferred**

Scope:

- Future unpaid EMI obligations.
- Future unpaid rent/lease obligations.
- Deposit adjustment audit evidence.

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
