# Phase F18 — Security Deposit Refund Bridge

Scope: controlled accounting bridge posting for concrete `subscriptions.RentLeaseDepositTransaction` refund rows only.

Supported event keys:

- `security_deposit_refund`
- `rent_security_deposit_refund`
- `lease_security_deposit_refund`

Supported source rows:

- `transaction_type=DEPOSIT_REFUND`
- legacy `transaction_type=REFUNDED` only when complete F16 source evidence exists

Accounting shape:

```text
Dr Security Deposit Liability
Cr RentLeaseDepositTransaction.finance_account.chart_account
```

F18 posts deposit refunds only. Deposit receipts remain handled by F17. F18 does not post rent/lease revenue, monthly collection settlement, customer advances, general customer refunds, direct-sale receipts, GST, or staff advances.

Eligibility requires a concrete refund row with positive amount, `plan_type` RENT/LEASE, active finance account with active chart account, payment method, transaction date, customer and subscription evidence, Security Deposit Liability mapping, open accounting period, and `JOURNAL_ENTRY` numbering.

Preview is read-only and does not consume numbering. Posting is admin-only, explicit, transactional, and idempotent. Posting creates only `JournalEntry`, `AccountingBridgePosting`, and a pending `ReconciliationItem`.

Posting must not mutate:

- `RentLeaseDepositTransaction`
- subscription/contract
- customer
- `RentLeaseCollection`
- `RentLeaseBillingDemand`
- `FinanceAccount`

Reconciliation remains pending until explicit verification. F18 does not auto-post, auto-reconcile, or auto-close periods.
