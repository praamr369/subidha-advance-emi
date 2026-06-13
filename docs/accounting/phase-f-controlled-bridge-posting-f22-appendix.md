# Phase F Controlled Bridge Posting — F22 Appendix

F22 is not a bridge posting phase. It is a source-contract hardening phase for customer advance refunds.

## Source decision

A safe customer advance refund source did not already exist. F22 adds this concrete source model:

```text
subscriptions.CustomerAdvanceRefund
```

Reserved event key for future F23:

```text
customer_advance_refund
```

F22 rejects these as customer advance refund sources:

- `CustomerAdvance` receipt rows; F20 owns receipt bridge
- `CustomerAdvanceAllocation` application rows; F21 owns application bridge
- `ReceiptDocument.customer_advance`; F2 owns that path
- `Payment`; F1/guards own payment-source classification
- `RentLeaseDepositTransaction` refund; F18 owns security-deposit refund
- `DirectSaleReturn`, `BillingCreditNote`, generic direct-sale customer refunds, and rent/lease collection sources
- `StaffAdvance`

## Non-posting guarantee

F22 does not create:

```text
JournalEntry
AccountingBridgePosting
ReconciliationItem
```

F22 does not auto-post, auto-reconcile, or auto-close periods.

## Operational behavior

The approved F22 refund source workflow records immutable refund evidence and reduces `CustomerAdvance.unapplied_amount` for the refunded advance only. This is operational source behavior, not accounting bridge posting.

The source row stores metadata marking accounting as deferred:

```text
source_contract_phase = F22
accounting_bridge_posting_deferred = true
future_bridge_phase = F23_CUSTOMER_ADVANCE_REFUND
creates_journal_entry = false
creates_accounting_bridge_posting = false
creates_reconciliation_item = false
```

## F23 condition

F23 Customer Advance Refund Bridge may start only after F22 source-contract tests and F20/F21 regressions pass. F23 must use `CustomerAdvanceRefund` only.
