# Product Recontract Posting and Reconciliation Integration Design

Status: **Phase 6F.1 design, Phase 6F.2 accounting posting bridge, and Phase 6F.3 reconciliation bridge are implemented on `update`; final recontract execution remains blocked**

Branch: `update`

This document defines the accounting and reconciliation bridge design for product upgrade/downgrade recontracts. Phase 6F.2 and 6F.3 create durable accounting and reconciliation evidence only. They do not enable final execution and do not mutate `Subscription`, `Emi`, `Payment`, `ReceiptDocument`, `FinanceAccount`, `MoneyMovement`, settlement/day-close records, inventory, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records.

## 1. Current repository facts

- Product recontract preview, saved event snapshot, customer consent, admin decision, schedule preview lines, financial impact preview, accounting posting bridge, and reconciliation bridge endpoints exist.
- `execute_product_recontract_event()` remains intentionally blocked with a controlled 400 until final orchestration is implemented.
- Phase 6F.2 posts accounting evidence through `AccountingBridgePosting` and `JournalEntry` using source model `ContractRecontractEvent` and purpose `CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT`.
- Phase 6F.3 creates reconciliation evidence through existing `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, and `FinancialSourceLifecycleEvent` records using logical source type `PRODUCT_RECONTRACT_ADJUSTMENT`.
- Settlement/day-close systems remain cash-evidence surfaces and are not mutated by product recontract accounting or reconciliation bridge phases.

## 2. Business accounting meaning

Product recontract is a contract value amendment, not cash collection.

- Upgrade creates additional receivable / contract increase.
- Downgrade reduces unpaid receivable first and creates customer credit liability for any overpaid portion.
- Already-paid amount remains preserved.
- Historical payments, receipts, ledgers, paid EMIs, posted journals, waivers, lucky draw evidence, settlement records, and day-close evidence are never rewritten.
- No receipt is created by recontract accounting or reconciliation bridge phases because no cash is received.
- Actual future cash collection must continue through the existing payment, receipt, accounting, and settlement workflows.

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

Upgrade posting:

```text
Dr Customer Receivable / Contract Receivable
Cr Product Recontract Revenue Adjustment / Contract Increase
Amount = additional receivable amount
```

Downgrade posting:

```text
Dr Product Recontract Revenue Adjustment / Contract Decrease
Cr Customer Receivable / Contract Receivable reduction
Cr Customer Credit / Customer Advance Liability, if overpaid
```

Phase 6F.2 creates only accounting evidence:

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
- `ReconciliationEvidence` rows linking:
  - `ContractRecontractEvent`
  - `ContractRecontractFinancialImpactPreview`
  - `AccountingBridgePosting`
  - `JournalEntry`
  - `FinancialSourceLifecycleEvent`
- `FinancialSourceLifecycleEvent` with logical source metadata for product recontract adjustment
- audit metadata event `CONTRACT_RECONTRACT_RECONCILIATION_QUEUED`
- `ContractRecontractEvent.metadata` reconciliation references

Phase 6F.3 is reconciliation evidence only. It does not execute the product change, change real EMI rows, create payments or receipts, settle money, close day-close records, or mutate settlement allocations.

## 5. Amount matching rules

Expected amount is derived from the financial impact preview:

- upgrade: `additional_receivable_amount`
- downgrade: `credit_or_reduction_amount`

Posted amount is derived from the linked posted journal total. Debit and credit totals must match. The posted amount must equal the expected amount.

If there is variance, the reconciliation bridge returns a controlled error and writes no reconciliation/lifecycle evidence.

## 6. EMI and payment rules

- Paid EMIs stay unchanged.
- Pending EMI rows stay unchanged until a later final execution phase.
- Paid receipts stay unchanged.
- Historical payment allocation history remains preserved.
- Recontract adjustment is not a payment and must not appear as cash collection.
- Future collections use the normal collection workflow after final execution is safely implemented.

## 7. Settlement and day-close rules

Product recontract bridge phases do not touch:

- bank statement lines
- UPI settlement lines
- cashier day-close rows
- settlement allocations
- finance account balances
- settlement status
- day-close approval/rejection/void status

The bridge is non-cash reconciliation evidence only.

## 8. Failure and rollback rules

- If accounting posting fails, no reconciliation bridge may be created.
- If reconciliation bridge amount validation fails, no reconciliation evidence or lifecycle event is created.
- If reconciliation evidence creation fails, final recontract execution must remain blocked.
- Duplicate accounting posting is rejected.
- Duplicate reconciliation bridge evidence is rejected.
- Future final execution must still run inside one transaction and preserve all historical records.

## 9. Final execution gate checklist

Execution may be enabled only after all gates are implemented and tested:

- saved preview event exists
- customer accepted
- admin approved
- schedule preview exists
- financial impact preview exists
- accounting bridge posting exists and is posted
- reconciliation bridge evidence exists and is linked
- expected amount equals posted amount
- pending EMI rows still map to schedule preview lines
- no blocking cancellation/reversal/dispute exists
- no duplicate execution metadata exists
- settlement/day-close and cash workflows remain unaffected

## 10. Rollout plan

- Phase 6F.1: design documentation — implemented.
- Phase 6F.2: durable accounting posting bridge — implemented.
- Phase 6F.3: durable reconciliation bridge — implemented.
- Phase 6F.4: final source mutation orchestration — deferred.
- Phase 6F.5: RC hardening, failure injection, ledger view, addendum, and UI readiness — deferred.

## 11. Migration notes

Phase 6F.3 uses existing reconciliation and lifecycle models. No migration is required.

Future optional additive models may still be introduced for more explicit reporting:

- `ContractRecontractPostingRecord`
- `ContractRecontractReconciliationRecord`
- dedicated product recontract revenue adjustment posting profile
- dedicated customer credit liability posting profile

No destructive migration is required.

## 12. Deployment notes

- Do not expose a frontend final execution button yet.
- Run backend tests for financial preview, accounting posting, reconciliation bridge, and blocked execution before rollout.
- Keep final execution blocked until Phase 6F.4 safely mutates subscription and pending EMI rows after accounting and reconciliation evidence is present.
