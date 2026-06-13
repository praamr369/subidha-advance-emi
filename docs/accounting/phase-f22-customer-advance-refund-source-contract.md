# Phase F22 — Customer Advance Refund Source Contract

Scope: source-contract hardening only for customer advance refund evidence.

F22 does **not** add accounting bridge posting. F23 will own the bridge posting phase.

Future F23 accounting shape:

```text
Dr Customer Advance Liability
Cr Cash / Bank / FinanceAccount
```

## Source decision

No previously existing source was safe enough for customer advance refund bridge posting.

F22 therefore adds a concrete source model:

```text
subscriptions.CustomerAdvanceRefund
```

Event key reserved for future F23:

```text
customer_advance_refund
```

F22 does not reuse F20/F21 event keys.

## Source matrix

| Candidate source | Decision | Reason | Next phase posture |
|---|---:|---|---|
| `CustomerAdvance` | Reject | This is receipt/unapplied-balance evidence. F20 owns its receipt bridge. | Keep F20 only. |
| `CustomerAdvanceAllocation` | Reject | This is application evidence. F21 owns Dr liability / Cr receivable. | Keep F21 only. |
| `CustomerAdvanceRefund` | Chosen | Concrete refund source with customer, source advance, amount, refund date, method, finance account, status, reference, idempotency key, creator, and metadata snapshot. | Only allowed source for F23 after F22 gates pass. |
| `RentLeaseDepositTransaction` refund | Reject | Security-deposit liability is not customer advance liability. F18 owns deposit refund. | Never use for customer advance refund. |
| `DirectSaleReturn`, `BillingCreditNote`, generic `CustomerRefund`, `ReceiptDocument`, `Payment` | Reject | These are direct-sale, credit, receipt, or payment-domain records unless explicitly proven otherwise. | Do not use for F23. |

## Source model fields

`CustomerAdvanceRefund` captures:

- `id`
- `refund_reference_no`
- `customer`
- source `CustomerAdvance`
- `amount`
- `refund_date`
- `payment_method`
- `finance_account`
- `status`
- `idempotency_key`
- `created_by`
- `created_at`
- `voided_by`
- `voided_at`
- `void_reason`
- `reversal_reference`
- `metadata_snapshot`
- `notes`

## Idempotency and uniqueness

F22 enforces:

- unique `refund_reference_no`
- unique non-empty `idempotency_key`
- same reference/key with identical source evidence returns the existing row
- same reference/key with different evidence is rejected
- refund amount must be positive
- refund amount cannot exceed current unapplied customer advance balance

## Operational balance behavior

Recording a refund through the approved F22 workflow reduces the source `CustomerAdvance.unapplied_amount` and refreshes the advance status.

This is the only CustomerAdvance mutation F22 allows. It is source-contract workflow behavior, not accounting posting.

Existing customer advance rows are preserved. No backfill mutates existing advances.

## Metadata snapshot

Each source row stores metadata including:

```text
source_contract_phase = F22
event_key = customer_advance_refund
source_model = CustomerAdvanceRefund
accounting_bridge_posting_deferred = true
future_bridge_phase = F23_CUSTOMER_ADVANCE_REFUND
creates_journal_entry = false
creates_accounting_bridge_posting = false
creates_reconciliation_item = false
```

## Explicit separation rules

Customer advance refund remains separate from:

- `RentLeaseDepositTransaction` refund
- `CustomerAdvance` receipt
- `CustomerAdvanceAllocation` application
- `ReceiptDocument.customer_advance`
- `Payment` / EMI payment
- `DirectSaleReturn`
- `BillingCreditNote`
- direct-sale customer refund / credit refund unless future proof explicitly ties it to `CustomerAdvanceRefund`
- `RentLeaseCollection`
- `StaffAdvance`

## F22 non-posting guarantee

F22 does not create:

- `JournalEntry`
- `AccountingBridgePosting`
- `ReconciliationItem`

F22 does not:

- auto-post
- auto-reconcile
- auto-close accounting periods
- create receipt documents
- create payment rows
- treat security-deposit refund as customer advance refund
- treat direct-sale refund as customer advance refund
- weaken F2/F20/F21 bridge ownership

## F23 entry condition

F23 may start only after these F22 checks pass:

```bash
.venv/bin/python manage.py test tests.accounting.test_customer_advance_refund_source_contract_phase_f22 --verbosity=1
.venv/bin/python manage.py test tests.accounting.test_accounting_bridge_customer_advance_receipt_phase_f20 tests.accounting.test_accounting_bridge_customer_advance_application_phase_f21 tests.accounting.test_customer_advance_refund_source_contract_phase_f22 --verbosity=1
.venv/bin/python manage.py test tests.accounting tests.reconciliation tests.subscriptions --verbosity=1
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
```

Frontend gates:

```bash
cd frontend
npm run typecheck
npm run lint
npm run build:smoke
```

F23 must use `CustomerAdvanceRefund` only and must not post from `CustomerAdvance`, `CustomerAdvanceAllocation`, `Payment`, `ReceiptDocument`, security deposit, direct-sale refund, or customer-credit sources.
