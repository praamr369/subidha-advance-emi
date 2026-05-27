# Product Recontract Posting and Reconciliation Integration Design

Status: **Phase 6F.4 backend execution is enabled on `update` after full accounting and reconciliation evidence verification.**

Branch: `update`

This document defines the accounting and reconciliation evidence required before product recontract execution.

## 1. Current repository facts

- Product recontract preview, saved event snapshot, customer consent, admin decision, schedule preview lines, financial impact preview, accounting posting bridge, reconciliation bridge, and backend execution exist.
- Phase 6F.2 posts accounting evidence through `AccountingBridgePosting` and `JournalEntry` using source model `ContractRecontractEvent` and purpose `CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT`.
- Phase 6F.3 creates reconciliation evidence through existing `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, and `FinancialSourceLifecycleEvent` records using logical source type `PRODUCT_RECONTRACT_ADJUSTMENT`.
- Phase 6F.4 verifies the evidence chain before source mutation.
- No frontend execution button is added in Phase 6F.4.

## 2. Business accounting meaning

Product recontract is a contract value amendment, not cash collection.

- Upgrade creates additional receivable / contract increase.
- Downgrade reduces unpaid receivable first and creates customer credit liability for any overpaid portion.
- Already-paid amount remains preserved.
- Historical payments, receipts, ledgers, paid EMIs, posted journals, waivers, lucky draw evidence, settlement records, and day-close evidence are never rewritten.
- No receipt is created by recontract execution because no cash is received.
- Actual future cash collection continues through the existing payment, receipt, accounting, and settlement workflows.

## 3. Accounting bridge behavior — Phase 6F.2

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/accounting-posting/
```

Required gates:

- latest `ContractRecontractEvent.status == PREVIEWED`
- customer consent is `ACCEPTED`
- admin approval is `APPROVED`
- schedule preview lines exist
- financial impact preview exists and has accounting/reconciliation preview statuses `PREVIEWED`
- no existing accounting bridge posting exists for the event and purpose

The accounting bridge creates only prerequisite evidence:

- `AccountingBridgePosting`
- posted `JournalEntry`
- `JournalEntryLine`
- audit metadata
- `ContractRecontractEvent.metadata` posting references

It does not create payments, receipts, settlements, day-close records, reconciliation records, or final recontract source mutations.

## 4. Reconciliation bridge behavior — Phase 6F.3

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/reconciliation-bridge/
```

Required gates:

- latest `ContractRecontractEvent.status == PREVIEWED`
- customer consent is `ACCEPTED`
- admin approval is `APPROVED`
- schedule preview lines exist
- financial impact preview exists and is `PREVIEWED`
- accounting bridge posting exists and is linked to a posted journal
- expected financial impact amount equals posted journal amount
- no reconciliation bridge item already exists for the event

Durable evidence created:

- `ReconciliationRun` with scope `PRODUCT_RECONTRACT_ADJUSTMENT`
- `ReconciliationItem` with source type `PRODUCT_RECONTRACT_ADJUSTMENT`
- `ReconciliationEvidence` rows linking the event, financial preview, accounting bridge, journal, and lifecycle event
- `FinancialSourceLifecycleEvent` with logical source metadata for product recontract adjustment
- audit metadata event `CONTRACT_RECONTRACT_RECONCILIATION_QUEUED`
- `ContractRecontractEvent.metadata` reconciliation references

## 5. Execution behavior — Phase 6F.4

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

Execution creates no accounting or reconciliation records. It verifies that the accounting and reconciliation evidence already exists and is internally consistent.

Execution mutates only:

- `Subscription.product`
- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- pending `Emi.amount`
- pending `Emi.due_date`
- `ContractRecontractEvent.metadata` execution snapshot

Execution does not mutate:

- paid/waived/cancelled EMI rows
- payments
- receipts
- accounting entries
- reconciliation rows
- settlement/day-close records
- finance account balances
- lucky ID or batch
- lucky draw or waiver records
- stock/inventory
- delivery
- commission/payout
- rent/lease demand or deposit records

## 6. Amount matching rules

Expected amount is derived from the financial impact preview:

- upgrade: `additional_receivable_amount`
- downgrade: `credit_or_reduction_amount`

Posted amount is derived from the linked posted journal total. Debit and credit totals must match. The posted amount must equal the expected amount.

The reconciliation item must also show expected amount equals actual amount and zero variance.

If there is variance, execution returns a controlled error and no subscription or EMI mutation is committed.

## 7. Settlement and day-close rules

Product recontract execution does not touch:

- bank statement lines
- UPI settlement lines
- cashier day-close rows
- settlement allocations
- finance account balances
- settlement status
- day-close approval/rejection/void status

The adjustment is non-cash contract evidence, not a settlement event.

## 8. Rollout plan

- Phase 6F.1: design documentation — implemented.
- Phase 6F.2: durable accounting posting bridge — implemented.
- Phase 6F.3: durable reconciliation bridge — implemented.
- Phase 6F.4: backend execution after evidence verification — implemented.
- Phase 6F.5: RC hardening, failure injection, ledger view, printable addendum, and admin typed-confirmation UI — deferred.

## 9. Migration notes

Phase 6F.4 uses existing models and event metadata. No migration is required.
