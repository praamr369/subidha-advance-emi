# Product Recontract Posting and Reconciliation Integration Design

Status: **Phase 6F.6 RC hardening is implemented on `update`.**

Branch: `update`

This document defines accounting and reconciliation evidence required before product recontract execution and the post-execution read-only rules.

## 1. Current repository facts

- Product recontract preview, saved event snapshot, customer consent, admin decision, schedule preview lines, financial impact preview, accounting posting bridge, reconciliation bridge, typed admin execution UI, and backend execution exist.
- Phase 6F.2 posts accounting evidence through `AccountingBridgePosting` and `JournalEntry` using source model `ContractRecontractEvent` and purpose `CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT`.
- Phase 6F.3 creates reconciliation evidence through `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, and `FinancialSourceLifecycleEvent` records using logical source type `PRODUCT_RECONTRACT_ADJUSTMENT`.
- Phase 6F.4 verifies evidence and performs the controlled source mutation.
- Phase 6F.5 exposes a typed admin-only execution UI.
- Phase 6F.6 adds executed-state visibility, readiness/reporting fields, and post-execution blockers. It adds no new mutation logic.

## 2. Business accounting meaning

Product recontract is a contract value amendment, not cash collection.

- Upgrade creates additional receivable / contract increase evidence.
- Downgrade reduces unpaid receivable first and creates customer credit liability evidence for any overpaid portion.
- Already-paid amount remains preserved.
- Historical payments, receipts, ledgers, paid EMIs, posted journals, waivers, lucky draw evidence, settlement records, and day-close evidence are never rewritten.
- No receipt is created by recontract execution because no cash is received.
- Future cash collection continues through existing payment, receipt, accounting, reconciliation, settlement, and day-close workflows.

## 3. Accounting bridge behavior — Phase 6F.2

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/accounting-posting/
```

Required gates:

- latest event is `PREVIEWED`
- customer consent is `ACCEPTED`
- admin approval is `APPROVED`
- schedule preview lines exist
- financial impact preview exists and is `PREVIEWED`
- no existing accounting bridge posting exists for the event
- event is not already executed

Accounting bridge creates only prerequisite evidence:

- `AccountingBridgePosting`
- posted `JournalEntry`
- `JournalEntryLine`
- audit metadata
- event metadata posting references

It does not execute recontract and does not mutate subscription, EMI, payment, receipt, settlement, reconciliation, inventory, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

## 4. Reconciliation bridge behavior — Phase 6F.3

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/reconciliation-bridge/
```

Required gates:

- latest event is `PREVIEWED`
- customer consent is `ACCEPTED`
- admin approval is `APPROVED`
- schedule preview lines exist
- financial impact preview exists and is `PREVIEWED`
- accounting bridge posting exists and is linked to a posted journal
- expected financial impact amount equals posted journal amount
- no reconciliation bridge item already exists for the event
- event is not already executed

Durable evidence created:

- `ReconciliationRun`
- `ReconciliationItem`
- `ReconciliationEvidence` rows linking event, financial preview, accounting bridge, journal, and lifecycle event
- `FinancialSourceLifecycleEvent`
- event metadata reconciliation references

## 5. Execution behavior — Phase 6F.4

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

Execution creates no accounting or reconciliation records. It verifies that accounting and reconciliation evidence already exists and is internally consistent.

Execution mutates only:

- `Subscription.product`
- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- `Subscription.product_snapshot`
- `Subscription.pricing_snapshot`
- pending `Emi.amount`
- pending `Emi.due_date`
- `ContractRecontractEvent.metadata`

Execution does not mutate paid/waived/cancelled EMIs, payments, receipts, accounting entries, reconciliation rows, settlement/day-close records, finance account balances, lucky ID, batch, lucky draw, waiver, stock, delivery, commission, payout, rent/lease demand, or deposit records.

## 6. Phase 6F.6 read-only hardening

After execution, the following actions are blocked/read-only:

- product recontract preview generation returns a blocked preview payload
- preview snapshot save returns controlled 400
- customer consent returns controlled 400
- admin decision returns controlled 400
- schedule preview returns controlled 400
- financial impact preview returns controlled 400
- accounting posting returns controlled 400
- reconciliation bridge returns controlled 400
- duplicate execution returns controlled 400

The executed event remains visible through serializers and UI reporting.

## 7. Amount matching rules

Expected amount comes from financial impact preview:

- upgrade: `additional_receivable_amount`
- downgrade: `credit_or_reduction_amount`

Posted amount comes from linked posted journal totals. Debit and credit totals must balance. Posted amount must equal expected amount.

Reconciliation expected amount must equal actual amount and variance must be zero.

## 8. Settlement and day-close rules

Product recontract execution does not touch:

- bank statement lines
- UPI settlement lines
- cashier day-close rows
- settlement allocations
- finance account balances
- settlement status
- day-close approval/rejection/void status

The adjustment is non-cash contract evidence, not a settlement event.

## 9. Reporting fields

Admin/customer detail payloads expose:

```text
workflow_flags
execution_ready
execution_block_reason
executed
executed_at
executed_by
execution_status
execution_snapshot
accounting_bridge_posting_id
journal_entry_id
reconciliation_item_id
reconciliation_run_id
reconciliation_evidence_ids
schedule_line_ids
old_monthly_amount
new_monthly_amount
```

## 10. Deferred work

Printable recontract addendum remains future Phase 6G.

Rollback/reversal remains a future controlled workflow and is not exposed in Phase 6F.6.

## 11. Migration notes

Phase 6F.6 uses existing models and event metadata. No migration is required.
