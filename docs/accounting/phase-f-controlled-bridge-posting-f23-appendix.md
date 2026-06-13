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

F22 owns source-contract creation/hardening for `CustomerAdvanceRefund`. F23 owns accounting bridge posting and reconciliation diagnostics for `CustomerAdvanceRefund` only.

## Posting contract

F23 preview is read-only. Posting is explicit, admin-only, idempotent, transactional, period-gated, numbering-gated, and mapping-gated. Posting creates one `JournalEntry`, one `AccountingBridgePosting`, and one pending `ReconciliationItem` only.

F23 does not mutate `CustomerAdvanceRefund`, `CustomerAdvance`, `CustomerAdvanceAllocation`, `Payment`, `ReceiptDocument`, `Emi`, customer, subscription/contract, or `FinanceAccount`. It does not reduce advance balance again and does not auto-post, auto-reconcile, or auto-close periods.

## Reconciliation-run diagnostics

F23.1 wires dedicated `CustomerAdvanceRefund` diagnostics into `backend/reconciliation/services/accounting_bridge_reconciliation.py`.

Dedicated codes:

- `CUSTOMER_ADVANCE_REFUND_MISSING_ACCOUNTING_BRIDGE_POSTING`
- `CUSTOMER_ADVANCE_REFUND_POSTED_UNVERIFIED`
- `CUSTOMER_ADVANCE_REFUND_AMOUNT_MISMATCH`
- `CUSTOMER_ADVANCE_REFUND_PERIOD_MISMATCH`
- `CUSTOMER_ADVANCE_REFUND_DUPLICATE_ACCOUNTING_BRIDGE_POSTING`
- `CUSTOMER_ADVANCE_REFUND_SOURCE_LINK_MISSING`
- `CUSTOMER_ADVANCE_REFUND_JOURNAL_UNBALANCED`
- `CUSTOMER_ADVANCE_REFUND_MAPPING_MISSING`
- `CUSTOMER_ADVANCE_REFUND_FINANCE_ACCOUNT_INACTIVE`
- `CUSTOMER_ADVANCE_REFUND_NUMBERING_MISSING`
- `CUSTOMER_ADVANCE_REFUND_UNSUPPORTED_SOURCE`
- `CUSTOMER_ADVANCE_REFUND_DUPLICATE_SOURCE_RISK`

Diagnostics detect missing bridge posting, posted-unverified refund rows, amount mismatch, refund-date period mismatch, duplicate bridge/journal postings, source-link mismatch, unbalanced journals, mapping blockers, finance-account blockers, numbering blockers, unsupported source posture, and duplicate-source risk against non-customer-advance refund domains.

Diagnostics may create `ReconciliationItem` and `ReconciliationEvidence` through the existing reconciliation diagnostic framework only. They do not create `JournalEntry`, do not create `AccountingBridgePosting`, do not post, do not reconcile, do not close periods, and do not mutate operational source records.

## Closeout status

F23 diagnostics are now wired. Phase F closeout/control-tower hardening can start only after the F20/F21/F22/F23 regression gates pass locally.
