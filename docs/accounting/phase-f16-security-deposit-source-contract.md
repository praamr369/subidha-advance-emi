# Phase F16 — Security Deposit Source Contract

Scope: source evidence only for rent/lease security deposit receipt and refund actions.

## Decision

F16 hardens the existing model:

```text
subscriptions.RentLeaseDepositTransaction
```

No duplicate source model is added.

## Source Fields

The hardened source row preserves:

- `id`
- `transaction_number`
- `external_reference_no`
- linked `subscription` and security-deposit `demand`
- linked customer
- `plan_type` limited to `RENT` or `LEASE`
- `transaction_type`: `DEPOSIT_RECEIPT`, `DEPOSIT_REFUND`, `DEPOSIT_ADJUSTMENT`
- amount
- transaction date
- payment method
- finance account
- status
- idempotency key
- created-by user
- created timestamp
- void/reversal fields
- metadata snapshot

Legacy rows with `COLLECTED`, `REFUNDED`, `DEDUCTION`, and `DEMAND_CREATED` remain readable for compatibility, but new source evidence should use the F16 transaction types.

## Accounting Boundary

F16 does not create:

- `JournalEntry`
- `AccountingBridgePosting`
- `ReconciliationItem`

F16 does not auto-post, auto-reconcile, close periods, or mutate monthly rent/lease collection evidence.

## Deferred Phases

F17 deposit receipt posting:

```text
Dr Cash / Bank / FinanceAccount
Cr Security Deposit Liability
```

F18 deposit refund posting:

```text
Dr Security Deposit Liability
Cr Cash / Bank / FinanceAccount
```

Both must use concrete `RentLeaseDepositTransaction` source rows and must remain explicit, admin-only, idempotent, period-gated, numbering-gated, and reconciliation-pending after posting.
