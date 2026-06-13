# Phase F21 — Controlled Customer Advance Application Bridge

Scope: controlled accounting bridge posting for concrete `subscriptions.CustomerAdvanceAllocation` application evidence only.

## Source boundary

F21 supports this source model only:

```text
subscriptions.CustomerAdvanceAllocation
```

Supported event key:

```text
customer_advance_application
```

Candidate id format:

```text
customeradvanceallocation:{id}:customer_advance_application
```

F21 does not post:

- `subscriptions.CustomerAdvance` receipt rows; F20 owns that path
- `billing.ReceiptDocument.customer_advance`; F2 owns that path
- `Payment` rows with `allocation_metadata.collection_mode=ADVANCE_ALLOCATION`; these stay excluded from F1 and act only as linked operational evidence for F21
- customer advance refunds; F22 requires refund-source hardening first
- security deposit receipt/refund, rent/lease collection, rent/lease revenue, EMI cash payment, direct-sale receipt, payroll, commission, vendor payment, salary payment, or StaffAdvance

## Accounting shape

```text
Dr Customer Advance Liability / CUSTOMER_ADVANCE_UNEARNED_REVENUE
Cr Customer Receivable / EMI Receivable / Invoice Receivable
```

F21 has no cash/bank line, no revenue line, no GST line, no Payment cash-collection line, and no ReceiptDocument line.

## Eligibility

A `CustomerAdvanceAllocation` row is postable only when:

- amount is greater than zero
- linked `CustomerAdvance` exists
- linked target receivable evidence exists through subscription and EMI
- linked `Payment` exists and is marked `ADVANCE_ALLOCATION`
- linked Payment metadata defers accounting to `F21_CUSTOMER_ADVANCE_APPLICATION`
- linked Payment amount/EMI/subscription match the allocation
- Customer Advance Liability mapping exists
- Customer Receivable mapping exists
- accounting period is open
- `JOURNAL_ENTRY` numbering is configured
- source/event has not already been posted

Rows with missing target evidence, missing or wrong linked Payment metadata, or ambiguous source posture are unsupported and non-postable.

## Preview contract

Preview is read-only. It does not create:

- `JournalEntry`
- `AccountingBridgePosting`
- `ReconciliationItem`
- document numbers

Preview does not consume journal numbering and does not mutate:

- `CustomerAdvanceAllocation`
- `CustomerAdvance`
- `Payment`
- `Emi`
- `ReceiptDocument`
- customer
- subscription/contract
- `FinanceAccount`

Safety copy:

```text
Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit customer advance, allocation, payment, EMI, receipt, customer, contract, or finance-account records.
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

F21 does not mutate:

- `CustomerAdvanceAllocation`
- `CustomerAdvance`
- `Payment`
- `Emi`
- `ReceiptDocument`
- customer
- subscription/contract
- `FinanceAccount`

It does not reduce advance balance again and does not mark EMI paid again. The service snapshots allocation, advance, linked payment, EMI, subscription, customer, and finance-account evidence before posting and rolls back if mutation is detected.

## Frontend contract

Bridge reconciliation exposes:

- source model filter: `CustomerAdvanceAllocation`
- label: `Customer Advance Application`
- allocation reference
- advance reference
- customer
- subscription / EMI target
- linked payment evidence
- amount
- allocation date
- allocated by
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

F22 must remain a separate source-contract and bridge phase.

## Required regression

```bash
.venv/bin/python manage.py test tests.accounting.test_accounting_bridge_customer_advance_application_phase_f21 --verbosity=1
.venv/bin/python manage.py test tests.accounting.test_customer_advance_source_contract_phase_f19 tests.accounting.test_accounting_bridge_receiptdocument_posting_phase_f2 tests.accounting.test_accounting_bridge_customer_advance_receipt_phase_f20 tests.accounting.test_accounting_bridge_customer_advance_application_phase_f21 --verbosity=1
.venv/bin/python manage.py test tests.accounting tests.reconciliation tests.subscriptions --verbosity=1
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
cd frontend
npm run typecheck
npm run lint
npm run build:smoke
```
