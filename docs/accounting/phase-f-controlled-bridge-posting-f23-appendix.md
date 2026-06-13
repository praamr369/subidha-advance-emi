# Phase F Controlled Bridge Posting — F23 Appendix

F23 extends controlled bridge posting to concrete customer advance refund source records only.

## Source model

```text
subscriptions.CustomerAdvanceRefund
```

## Event key

```text
customer_advance_refund
```

## Accounting shape

```text
Dr Customer Advance Liability / CUSTOMER_ADVANCE_UNEARNED_REVENUE
Cr CustomerAdvanceRefund.finance_account.chart_account
```

F23 uses the concrete refund source finance account. It does not hard-code Cash or Bank.

## Separation from earlier slices

F23 does not post:

- `CustomerAdvance` receipt rows; F20 owns that path
- `CustomerAdvanceAllocation` application rows; F21 owns that path
- `ReceiptDocument.customer_advance`; F2 owns that path
- `Payment` rows; F1/guards own payment-source classification
- security deposit receipt/refund; F17/F18 own those paths
- rent/lease revenue or collection; F14/F15C own those paths
- direct-sale refund or customer-credit refund
- EMI payment/refund
- `StaffAdvance`

## Posting contract

F23 preview is read-only. Posting is explicit, admin-only, idempotent, transactional, period-gated, numbering-gated, and mapping-gated. Posting creates one `JournalEntry`, one `AccountingBridgePosting`, and one pending `ReconciliationItem` only.

F23 does not mutate `CustomerAdvanceRefund`, `CustomerAdvance`, `CustomerAdvanceAllocation`, `Payment`, `ReceiptDocument`, `Emi`, customer, subscription/contract, or `FinanceAccount`. It does not reduce advance balance again and does not auto-post, auto-reconcile, or auto-close periods.

## Closeout dependency

Before Phase F closeout/control-tower hardening starts, dedicated reconciliation-run diagnostics must include `CustomerAdvanceRefund` codes for missing bridge posting, posted-unverified, amount mismatch, period mismatch, duplicate posting, source-link missing, journal unbalanced, mapping/finance/numbering blockers, unsupported source, and duplicate non-customer-advance refund risk.
