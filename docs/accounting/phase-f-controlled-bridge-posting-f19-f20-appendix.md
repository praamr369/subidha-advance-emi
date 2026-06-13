# Phase F Controlled Bridge Posting — F19/F20 Appendix

This appendix is the append-only F19/F20 closeout content for the main Phase F bridge history. It must be copied into `docs/accounting/phase-f-controlled-bridge-posting.md` after the Phase F18 section when making the final consolidated bridge-history document.

## Phase F19 — Customer advance source contract audit and hardening

F19 audited and hardened customer advance source contracts without adding accounting posting.

Authoritative source evidence identified for future bridge phases:

- `subscriptions.CustomerAdvance` is operational unapplied customer advance receipt evidence for possible F20.
- `subscriptions.CustomerAdvanceAllocation` is customer advance application evidence for possible F21.
- F2 `billing.ReceiptDocument.customer_advance` remains an existing bridge path and must not be duplicated.
- A production-safe customer advance refund source is not yet proven; F22 requires separate source hardening before refund posting.

F19 removed legacy immediate accounting posting behavior from customer advance receipt/application workflows where present. F19 did not create `JournalEntry`, `AccountingBridgePosting`, or `ReconciliationItem` records.

Separation boundary:

- Security deposits are not customer advances.
- Rent/lease monthly collection is not customer advance.
- EMI payment is not customer advance.
- Direct-sale receipt is not customer advance.
- Refunds, payroll, commission, vendor payment, salary payment, and StaffAdvance remain separate workflows.

Future bridge plan:

```text
F20 Customer Advance Receipt:      Dr FinanceAccount.chart_account, Cr Customer Advance Liability
F21 Customer Advance Application:  Dr Customer Advance Liability, Cr Customer Receivable / Invoice Receivable
F22 Customer Advance Refund:       Dr Customer Advance Liability, Cr FinanceAccount.chart_account
```

## Phase F20 — Customer advance receipt bridge

F20 extends controlled bridge posting to concrete `subscriptions.CustomerAdvance` receipt rows only.

Supported source model:

```text
subscriptions.CustomerAdvance
```

Supported event key:

```text
customer_advance_receipt
```

Accounting shape:

```text
Dr CustomerAdvance.finance_account.chart_account
Cr Customer Advance Liability / CUSTOMER_ADVANCE_UNEARNED_REVENUE
```

F20 does not post `ReceiptDocument.customer_advance` because F2 owns that bridge path. F20 does not post `CustomerAdvanceAllocation` application rows because F21 owns that future path. F20 does not post customer advance refunds because F22 requires refund-source hardening and bridge approval first. F20 does not allow `ADVANCE_ALLOCATION` Payment rows through F1 Payment collection.

F20 preview is read-only. It does not create `JournalEntry`, `AccountingBridgePosting`, `ReconciliationItem`, or document numbers, and it does not mutate `CustomerAdvance`, `CustomerAdvanceAllocation`, `Payment`, `ReceiptDocument`, customer, subscription/contract, or `FinanceAccount` records.

F20 posting is explicit, admin-only, idempotent, transactional, period-gated, numbering-gated, and mapping-gated. Posting creates accounting bridge evidence only:

- one posted `JournalEntry`
- one `AccountingBridgePosting`
- one pending `ReconciliationItem`

F20 posting does not mark the advance posted, settled, applied, refunded, or reconciled. It does not mutate source/customer/finance-account records, does not auto-post, does not auto-reconcile, and does not auto-close periods.

F20 remains separate from security deposit receipt/refund, rent/lease collection, F14 rent/lease demand revenue, EMI payment, direct-sale receipt, payroll, commission, vendor payment, salary payment, and StaffAdvance.

## F20 reconciliation diagnostics

F20 reconciliation-run diagnostics use dedicated codes:

```text
CUSTOMER_ADVANCE_RECEIPT_MISSING_ACCOUNTING_BRIDGE_POSTING
CUSTOMER_ADVANCE_RECEIPT_POSTED_UNVERIFIED
CUSTOMER_ADVANCE_RECEIPT_AMOUNT_MISMATCH
CUSTOMER_ADVANCE_RECEIPT_PERIOD_MISMATCH
CUSTOMER_ADVANCE_RECEIPT_DUPLICATE_ACCOUNTING_BRIDGE_POSTING
CUSTOMER_ADVANCE_RECEIPT_SOURCE_LINK_MISSING
CUSTOMER_ADVANCE_RECEIPT_JOURNAL_UNBALANCED
CUSTOMER_ADVANCE_RECEIPT_MAPPING_MISSING
CUSTOMER_ADVANCE_RECEIPT_FINANCE_ACCOUNT_INACTIVE
CUSTOMER_ADVANCE_RECEIPT_NUMBERING_MISSING
CUSTOMER_ADVANCE_RECEIPT_UNSUPPORTED_SOURCE
CUSTOMER_ADVANCE_RECEIPT_DUPLICATE_F2_RECEIPTDOCUMENT_RISK
```

Diagnostics are read/check only. They do not create `JournalEntry`, do not create `AccountingBridgePosting`, and do not mutate `CustomerAdvance`, `CustomerAdvanceAllocation`, `Payment`, `ReceiptDocument`, customer, subscription/contract, or `FinanceAccount` records.
