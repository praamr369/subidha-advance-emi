# Phase F20 — Controlled Customer Advance Receipt Bridge

Scope: controlled accounting bridge posting for concrete `subscriptions.CustomerAdvance` receipt evidence only.

## Source boundary

F20 supports this source model only:

```text
subscriptions.CustomerAdvance
```

Supported event key:

```text
customer_advance_receipt
```

Candidate id format:

```text
customeradvance:{id}:customer_advance_receipt
```

F20 does not post:

- `billing.ReceiptDocument.customer_advance` because that remains the existing F2 path
- `CustomerAdvanceAllocation` because that belongs to F21
- linked `Payment` rows with `allocation_metadata.collection_mode=ADVANCE_ALLOCATION` because those remain excluded from F1 and belong to F21
- customer advance refunds because F22 requires a concrete refund source contract first
- security deposits, rent/lease collection, EMI payments, direct-sale receipts, payroll, commission, vendor payment, or StaffAdvance

## Accounting shape

```text
Dr CustomerAdvance.finance_account.chart_account
Cr Customer Advance Liability / CUSTOMER_ADVANCE_UNEARNED_REVENUE
```

F20 has no revenue line, receivable line, GST line, EMI payment line, or `ReceiptDocument` line.

## Eligibility

A `CustomerAdvance` row is postable only when:

- amount is greater than zero
- customer evidence exists
- payment date exists
- payment method exists
- finance account exists
- finance account is active
- finance account maps to an active chart account
- Customer Advance Liability mapping exists
- accounting period is open
- `JOURNAL_ENTRY` numbering is configured
- source metadata marks `accounting_bridge_posting_deferred=true`
- source metadata marks `future_bridge_phase=F20_CUSTOMER_ADVANCE_RECEIPT`
- the source/event has not already been posted

ReceiptDocument-owned advance rows are skipped to avoid duplicating F2.
Legacy rows missing F19/F20 metadata are visible as unsupported and non-postable.

## Preview contract

Preview is read-only. It does not create:

- `JournalEntry`
- `AccountingBridgePosting`
- `ReconciliationItem`

Preview does not consume journal numbering and does not mutate:

- `CustomerAdvance`
- `CustomerAdvanceAllocation`
- `Payment`
- `ReceiptDocument`
- customer
- contract/subscription
- finance account

Safety copy:

```text
Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit customer advance, allocation, payment, receipt, customer, contract, or finance-account records.
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

Posting creates:

- one `JournalEntry`
- one `AccountingBridgePosting`
- one pending `ReconciliationItem`

Posting does not mark the source as posted/settled and does not mark reconciliation as verified.

## No-source-mutation contract

F20 does not mutate:

- `CustomerAdvance`
- `CustomerAdvanceAllocation`
- `Payment`
- `ReceiptDocument`
- customer
- subscription/contract
- finance account

The service snapshots source and linked customer/finance-account evidence before posting and rolls back if mutation is detected.

## Frontend contract

Bridge reconciliation exposes:

- source model filter: `CustomerAdvance`
- label: `Customer Advance Receipt`
- advance reference
- customer
- amount
- unapplied amount
- method
- finance account
- finance-account active state
- payment date
- status
- event key
- journal state
- reconciliation state

No new bridge post button was added outside the existing controlled bridge reconciliation cockpit.

## F20/F21/F22 separation

F20: customer advance receipt

```text
Dr FinanceAccount.chart_account
Cr Customer Advance Liability
```

F21: customer advance application

```text
Dr Customer Advance Liability
Cr Customer Receivable / Invoice Receivable
```

F22: customer advance refund

```text
Dr Customer Advance Liability
Cr FinanceAccount.chart_account
```

F21 and F22 must remain separate phases.

## Required regression

```bash
.venv/bin/python manage.py test tests.accounting.test_accounting_bridge_customer_advance_receipt_phase_f20 --verbosity=1
.venv/bin/python manage.py test tests.accounting.test_customer_advance_source_contract_phase_f19 tests.accounting.test_accounting_bridge_receiptdocument_posting_phase_f2 tests.accounting.test_accounting_bridge_customer_advance_receipt_phase_f20 --verbosity=1
.venv/bin/python manage.py test tests.accounting tests.reconciliation tests.subscriptions --verbosity=1
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
cd frontend
npm run typecheck
npm run lint
npm run build:smoke
```
