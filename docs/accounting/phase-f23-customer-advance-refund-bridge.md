# Phase F23 — Controlled Customer Advance Refund Bridge

Scope: controlled accounting bridge posting for concrete `subscriptions.CustomerAdvanceRefund` source rows only.

## Source boundary

F23 supports this source model only:

```text
subscriptions.CustomerAdvanceRefund
```

Supported event key:

```text
customer_advance_refund
```

Candidate id format:

```text
customeradvancerefund:{id}:customer_advance_refund
```

F23 does not post:

- `subscriptions.CustomerAdvance`; F20 owns customer advance receipt
- `subscriptions.CustomerAdvanceAllocation`; F21 owns customer advance application
- `billing.ReceiptDocument.customer_advance`; F2 owns that path
- `Payment` rows
- security deposit receipt/refund
- rent/lease collection
- rent/lease revenue
- direct-sale refund
- customer credit refund
- EMI payment/refund
- `StaffAdvance`

## Accounting shape

```text
Dr Customer Advance Liability / CUSTOMER_ADVANCE_UNEARNED_REVENUE
Cr CustomerAdvanceRefund.finance_account.chart_account
```

F23 never hard-codes Cash or Bank. The credit line always uses the concrete `CustomerAdvanceRefund.finance_account.chart_account`.

F23 has no revenue line, no receivable line, no GST line, no Payment cash-collection line, no ReceiptDocument line, no CustomerAdvance receipt line, and no CustomerAdvanceAllocation application line.

## Eligibility

A refund row is postable only when:

- source is concrete `CustomerAdvanceRefund`
- event key is `customer_advance_refund`
- amount is greater than zero
- source `CustomerAdvance` exists
- customer evidence exists and matches the source advance customer
- finance account exists
- finance account is active
- finance account has an active chart-account mapping
- Customer Advance Liability mapping exists
- accounting period is open
- `JOURNAL_ENTRY` numbering is configured
- source/event has not already been posted
- source is not voided or reversed

## Preview contract

Preview is read-only. It does not create:

- `JournalEntry`
- `AccountingBridgePosting`
- `ReconciliationItem`
- document numbers

Preview does not consume journal numbering and does not mutate:

- `CustomerAdvanceRefund`
- `CustomerAdvance`
- `CustomerAdvanceAllocation`
- `Payment`
- `ReceiptDocument`
- `Emi`
- customer
- subscription/contract
- `FinanceAccount`

Safety copy:

```text
Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit customer advance refund, source advance, allocation, payment, receipt, customer, contract, or finance-account records.
```

## Posting contract

Posting is:

- admin-only
- explicit confirmation required
- idempotency-key required
- wrapped in `transaction.atomic`
- source-row locked where possible
- postability rechecked inside the transaction
- duplicate source/event protected
- balanced journal required
- period-gated
- numbering-gated
- mapping-gated

Posting creates:

- one `JournalEntry`
- one `AccountingBridgePosting`
- one pending `ReconciliationItem`

Posting does not mark the source as posted/settled and does not mark reconciliation as verified.

## No-source-mutation contract

F23 does not mutate:

- `CustomerAdvanceRefund`
- `CustomerAdvance`
- `CustomerAdvanceAllocation`
- `Payment`
- `ReceiptDocument`
- `Emi`
- customer
- subscription/contract
- `FinanceAccount`

It does not reduce advance balance again. The service snapshots refund, source advance, customer, and finance-account evidence before posting and rolls back if mutation is detected.

## Frontend contract

Bridge reconciliation exposes:

- source model filter: `CustomerAdvanceRefund`
- label: `Customer Advance Refund`
- refund reference
- customer
- source advance reference
- amount
- refund date
- payment method
- finance account
- finance-account active state
- source model
- event key
- journal state
- reconciliation state

No new bridge button was added outside the existing controlled bridge reconciliation cockpit.

## Required regression

```bash
.venv/bin/python manage.py test tests.accounting.test_accounting_bridge_customer_advance_refund_phase_f23 --verbosity=1
.venv/bin/python manage.py test tests.accounting.test_accounting_bridge_customer_advance_receipt_phase_f20 tests.accounting.test_accounting_bridge_customer_advance_application_phase_f21 tests.accounting.test_customer_advance_refund_source_contract_phase_f22 tests.accounting.test_accounting_bridge_customer_advance_refund_phase_f23 --verbosity=1
.venv/bin/python manage.py test tests.accounting tests.reconciliation tests.subscriptions --verbosity=1
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
cd frontend
npm run typecheck
npm run lint
npm run build:smoke
```

## Known closeout note

The F23 bridge service, API wrapper, read service, cockpit support, and backend F23 bridge tests were added in this phase. Dedicated reconciliation-run diagnostic-code wiring in `backend/reconciliation/services/accounting_bridge_reconciliation.py` must be completed before Phase F closeout/control-tower hardening is considered ready.
