# Phase F15B — Rent/Lease Collection Source Contract

Scope: source evidence only for monthly rent/lease collections.

## Reason for F15 deferral

F15 settlement posting was deferred because the existing monthly rent/lease collection flow only updated aggregate demand state:

- `RentLeaseBillingDemand.collected_amount`
- `RentLeaseBillingDemand.status`
- audit metadata

That was not enough to prove a single collection action with amount, date, method, finance account, reference, operator, and idempotency protection.

## Source model chosen

F15B adds the concrete source model:

```text
subscriptions.RentLeaseCollection
```

This model records one monthly rent/lease collection evidence row per successful monthly collection action.

## Contract fields

The source row preserves:

- collection number
- external reference number
- linked monthly demand
- linked subscription
- linked contract reference where available
- linked customer
- `plan_type` limited to `RENT` or `LEASE`
- amount
- payment date
- payment method
- finance account
- status
- created-by user
- creation timestamp
- idempotency key
- void/reversal marker fields
- metadata snapshot

## Behavior

The monthly rent/lease collection service now:

1. preserves existing demand collection behavior
2. creates one `RentLeaseCollection` row for monthly rent/lease collection evidence
3. reuses the same source row for repeated matching idempotency/reference requests
4. rejects duplicate evidence keys when amount, date, method, finance account, demand, or subscription differs
5. exposes latest source evidence through unified rent/lease receivable search

## Separation boundary

`RentLeaseCollection` is not used for:

- security deposits
- deposit refunds
- customer advances
- customer refunds
- direct-sale receipts
- rent/lease revenue recognition

Those remain separate source contracts or later phases.

## Accounting boundary

F15B does not perform accounting posting. It only creates source evidence.

Posting remains deferred to F15C. F15C should use `subscriptions.RentLeaseCollection` as the candidate source only after F15B tests pass.

## Required checks

```bash
.venv/bin/python manage.py test tests.subscriptions.test_rent_lease_collection_source_contract_phase_f15b --verbosity=1
.venv/bin/python manage.py test tests.accounting tests.reconciliation tests.subscriptions --verbosity=1
cd frontend
npm run typecheck
npm run lint
npm run build:smoke
```
