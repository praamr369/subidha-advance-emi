# Phase F Controlled Bridge Posting — F21 Appendix

This appendix records the append-only F21 bridge-history section for the controlled Phase F accounting bridge record.

## Phase F21 — Customer advance application bridge

F21 extends controlled bridge posting to concrete `subscriptions.CustomerAdvanceAllocation` application evidence only.

Supported source model:

```text
subscriptions.CustomerAdvanceAllocation
```

Supported event key:

```text
customer_advance_application
```

Accounting shape:

```text
Dr Customer Advance Liability / CUSTOMER_ADVANCE_UNEARNED_REVENUE
Cr Customer Receivable / EMI Receivable / Invoice Receivable
```

F21 does not post `subscriptions.CustomerAdvance` receipt rows because F20 owns that path. F21 does not post `billing.ReceiptDocument.customer_advance` because F2 owns that path. F21 does not post `ADVANCE_ALLOCATION` Payment rows as F1 payment collection; the linked Payment is evidence only and remains excluded from F1. Customer advance refunds remain deferred to F22.

F21 preview is read-only. Posting is explicit, admin-only, idempotent, transactional, period-gated, numbering-gated, and mapping-gated. Posting creates one `JournalEntry`, one `AccountingBridgePosting`, and one pending `ReconciliationItem` only.

F21 does not mutate `CustomerAdvanceAllocation`, `CustomerAdvance`, `Payment`, `Emi`, `ReceiptDocument`, customer, subscription/contract, or `FinanceAccount`. It does not reduce advance balance again and does not mark EMI paid again. It does not auto-post, auto-reconcile, or auto-close periods.

F21 remains separate from security deposits, rent/lease collection, rent/lease revenue, EMI cash payment, direct-sale receipt, payroll, commission, vendor payment, salary payment, and StaffAdvance.

## F21 reconciliation diagnostics

F21 reconciliation-run diagnostics use dedicated codes:

```text
CUSTOMER_ADVANCE_APPLICATION_MISSING_ACCOUNTING_BRIDGE_POSTING
CUSTOMER_ADVANCE_APPLICATION_POSTED_UNVERIFIED
CUSTOMER_ADVANCE_APPLICATION_AMOUNT_MISMATCH
CUSTOMER_ADVANCE_APPLICATION_PERIOD_MISMATCH
CUSTOMER_ADVANCE_APPLICATION_DUPLICATE_ACCOUNTING_BRIDGE_POSTING
CUSTOMER_ADVANCE_APPLICATION_SOURCE_LINK_MISSING
CUSTOMER_ADVANCE_APPLICATION_JOURNAL_UNBALANCED
CUSTOMER_ADVANCE_APPLICATION_MAPPING_MISSING
CUSTOMER_ADVANCE_APPLICATION_NUMBERING_MISSING
CUSTOMER_ADVANCE_APPLICATION_UNSUPPORTED_SOURCE
CUSTOMER_ADVANCE_APPLICATION_PAYMENT_F1_DUPLICATE_RISK
```

Diagnostics are read/check only. They do not create `JournalEntry`, do not create `AccountingBridgePosting`, and do not mutate customer advance, allocation, payment, EMI, receipt, customer, subscription/contract, or finance-account records.
