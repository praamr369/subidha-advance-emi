# Phase F15C.1 — Rent/Lease Collection Settlement Bridge Closeout

Scope: controlled accounting bridge posting closeout for concrete `subscriptions.RentLeaseCollection` settlement rows.

## Source boundary

F15B created the concrete evidence source:

```text
subscriptions.RentLeaseCollection
```

F15C uses that source only. It does not infer posting from `RentLeaseBillingDemand.collected_amount`, `RentLeaseBillingDemand.status`, or audit metadata.

## Accounting shape

```text
Dr RentLeaseCollection.finance_account.chart_account
Cr Customer Receivable / Rent-Lease Receivable
```

No cash/bank account is guessed. The concrete source finance account must exist, be active, and map to an active chart account.

## Supported event keys

```text
rent_payment_settlement
lease_payment_settlement
rent_lease_payment_settlement
```

`rent_payment_settlement` is used for `plan_type=RENT`.
`lease_payment_settlement` is used for `plan_type=LEASE`.

## Posting contract

F15C remains:

- preview-first
- explicit admin-only
- idempotent by concrete source/event/idempotency key
- period-gated
- journal-numbering-gated
- reconciliation-pending after posting

Posting creates accounting evidence only:

- `JournalEntry`
- `AccountingBridgePosting`
- pending `ReconciliationItem`

## No-source-mutation contract

F15C does not mutate:

- `RentLeaseCollection`
- `RentLeaseBillingDemand`
- `Subscription`
- contract metadata
- customer/party records
- security deposit records
- `FinanceAccount`

F15C does not auto-post, auto-reconcile, or close accounting periods.

## Reconciliation diagnostics

F15C closeout adds dedicated diagnostics for `RentLeaseCollection`:

```text
RENT_LEASE_COLLECTION_MISSING_ACCOUNTING_BRIDGE_POSTING
RENT_LEASE_COLLECTION_POSTED_UNVERIFIED
RENT_LEASE_COLLECTION_AMOUNT_MISMATCH
RENT_LEASE_COLLECTION_PERIOD_MISMATCH
RENT_LEASE_COLLECTION_DUPLICATE_ACCOUNTING_BRIDGE_POSTING
RENT_LEASE_COLLECTION_SOURCE_LINK_MISSING
RENT_LEASE_COLLECTION_JOURNAL_UNBALANCED
RENT_LEASE_COLLECTION_MAPPING_MISSING
RENT_LEASE_COLLECTION_FINANCE_ACCOUNT_INACTIVE
RENT_LEASE_COLLECTION_NUMBERING_MISSING
RENT_LEASE_COLLECTION_UNSUPPORTED_SOURCE
```

Diagnostics do not mutate collection, demand, subscription, customer, deposit, or finance-account records. They may create normal diagnostic `ReconciliationItem` rows for the reconciliation run.

## Separation from F14

F14 remains monthly rent/lease revenue recognition from `RentLeaseBillingDemand`:

```text
Dr Customer Receivable
Cr Rent Income / Lease Income
```

F15C is monthly collection settlement from `RentLeaseCollection`:

```text
Dr FinanceAccount.chart_account
Cr Customer Receivable
```

These phases must remain separate.

## Deferred phases

The following remain separate phases and are not part of F15C:

- security deposit receipt posting
- security deposit refund posting
- customer advance posting
- customer refund posting
- rent/lease demand revenue posting beyond existing F14

## Required regression

```bash
.venv/bin/python manage.py test tests.accounting.test_accounting_bridge_rent_lease_collection_settlement_phase_f15c --verbosity=1
.venv/bin/python manage.py test tests.subscriptions.test_rent_lease_collection_source_contract_phase_f15b tests.accounting.test_accounting_bridge_rent_lease_revenue_phase_f14 tests.accounting.test_accounting_bridge_rent_lease_collection_settlement_phase_f15c --verbosity=1
.venv/bin/python manage.py test tests.accounting tests.reconciliation tests.subscriptions --verbosity=1
cd frontend
npm run typecheck
npm run lint
npm run build:smoke
```
