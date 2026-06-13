# Phase F17 — Security Deposit Receipt Bridge

Scope: controlled accounting bridge posting for concrete `subscriptions.RentLeaseDepositTransaction` receipt rows only.

Supported event keys:

- `security_deposit_receipt`
- `rent_security_deposit_receipt`
- `lease_security_deposit_receipt`

Accounting shape:

```text
Dr RentLeaseDepositTransaction.finance_account.chart_account
Cr Security Deposit Liability
```

F17 posts deposit receipts only. It does not post deposit refunds, rent/lease monthly collections, rent/lease revenue, customer advances, direct-sale receipts, GST, or refunds.

Eligibility requires a concrete receipt row with positive amount, `plan_type` RENT/LEASE, active finance account with active chart account, payment method, transaction date, customer and subscription evidence, Security Deposit Liability mapping, open accounting period, and `JOURNAL_ENTRY` numbering.

Preview is read-only and does not consume numbering. Posting is admin-only, explicit, transactional, idempotent, and creates only `JournalEntry`, `AccountingBridgePosting`, and a pending `ReconciliationItem`.

Posting must not mutate:

- `RentLeaseDepositTransaction`
- subscription/contract
- customer
- `RentLeaseCollection`
- `RentLeaseBillingDemand`
- `FinanceAccount`

Refund rows are deferred to F18:

```text
Dr Security Deposit Liability
Cr Cash / Bank / FinanceAccount
```
