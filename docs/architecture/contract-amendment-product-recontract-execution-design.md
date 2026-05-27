# Contract Amendment Product Recontract Execution Design

Status: **Phase 6F.6 RC hardening is implemented on `update`.**

Branch: `update`

## 1. Business meaning

Product recontract is a controlled contract value amendment. It changes future commercial terms of an approved EMI subscription after saved preview, customer consent, admin approval, schedule preview, accounting posting evidence, and reconciliation bridge evidence.

Historical payments, receipts, paid EMIs, waived EMIs, cancelled EMIs, lucky draw evidence, posted journals, reconciliation evidence, settlement records, day-close evidence, inventory, delivery, commission, payout, rent/lease demand, and deposit records remain immutable.

## 2. Phase 6F.6 hardening scope

Phase 6F.6 is hardening only. It adds no new mutation logic, no rollback, no reversal, and no weakened evidence gates.

Implemented hardening:

- explicit serializer/reporting fields for executed state
- `workflow_flags` for preview, consent, approval, schedule, accounting, reconciliation, and execution status
- `execution_ready` and `execution_block_reason` read-only fields
- post-execution blockers for preview/save/consent/admin-decision/schedule/financial/accounting/reconciliation actions
- admin read-only executed evidence visibility
- customer read-only executed summary
- tests for executed-state payload visibility and post-execution blockers

## 3. Execution endpoint

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

The endpoint remains the only final source-mutation path. It still verifies all accounting and reconciliation evidence inside the backend transaction. No page auto-executes recontract.

## 4. Execution gates

Execution still requires:

- amendment status `APPROVED`
- amendment type `PRODUCT_CHANGE`
- latest event status `PREVIEWED`
- no prior execution metadata
- customer consent `ACCEPTED`
- admin approval `APPROVED`
- schedule preview lines mapped to pending EMI rows
- financial impact preview
- accounting bridge posting and posted journal
- zero accounting variance
- reconciliation item/run/evidence linked and matched
- zero reconciliation variance
- active EMI subscription with batch and lucky ID intact
- no subscription operational cancellation

## 5. Fields mutated by execution

Only these source fields are changed:

- `Subscription.product`
- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- `Subscription.product_snapshot`
- `Subscription.pricing_snapshot`
- pending `Emi.amount`
- pending `Emi.due_date`
- `ContractRecontractEvent.metadata` execution snapshot

`ContractRecontractEvent.status` remains `PREVIEWED`; execution truth is exposed through explicit serializer fields and metadata.

## 6. Explicit serializer/reporting fields

`ContractRecontractEventSerializer` and `ContractAmendmentSerializer.latest_product_recontract_preview` expose:

```text
workflow_flags
executed
executed_at
executed_by
execution_status
execution_ready
execution_block_reason
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

UI/reporting must use these fields instead of parsing raw metadata.

## 7. Executed-state visibility

Admin amendment detail shows read-only execution evidence, including product/amount/EMI change and accounting/reconciliation references.

Customer amendment detail shows safe read-only text:

```text
This recontract updated future contract terms after approval. Previous payments and receipts remain unchanged.
```

Customer, partner, cashier, and vendor users must never see execution controls.

## 8. Post-execution behavior

After execution, the following actions are blocked/read-only with controlled errors or blocked preview payloads:

- product recontract preview generation
- preview snapshot save
- customer consent
- admin decision
- schedule preview regeneration
- financial impact preview regeneration
- accounting posting
- reconciliation bridge creation
- duplicate execution

No rollback/reversal button or endpoint is exposed in this phase.

## 9. Snapshot and print policy

Execution refreshes `Subscription.product_snapshot` and `Subscription.pricing_snapshot` to the current executed contract truth. Current contract print views should use current subscription fields/snapshots.

Historical pre-recontract values remain in `ContractRecontractEvent.metadata.before_subscription`.

Phase 6G adds a printable Product Recontract Addendum and customer-facing ledger statement for executed recontracts. The print route uses existing executed recontract evidence from the amendment detail payload:

- old/new product snapshots and contract terms
- customer consent and admin approval timestamps
- execution timestamp and actor reference
- approved pending EMI schedule preview lines
- accounting bridge and journal references
- reconciliation run/item/evidence references
- preservation/protection statements

Phase 6G is document-only. It does not create, execute, reverse, rollback, settle, reconcile, post accounting, collect payment, issue receipts, move stock, alter delivery, alter waiver/draw, alter commission/payout, or mutate rent/lease demand or deposit records.

## 10. Preserved records

Execution does not mutate:

- paid, waived, or cancelled EMI rows
- payments
- receipts
- accounting bridge postings and journal entries
- reconciliation runs/items/evidence
- lifecycle events
- settlement/day-close records
- finance account balances
- lucky ID and batch
- draw/waiver records
- stock/inventory and delivery records
- commission/payout records
- rent/lease demand or deposit records

## 11. Future controlled workflows

Printable recontract addendum is implemented in Phase 6G as a read-only evidence document.

Rollback/reversal remains a separate future controlled workflow requiring explicit accounting, reconciliation, audit, and admin approval design. It is not exposed in Phase 6F.6.
