# Contract Amendment Product Recontract Execution Design

Status: **Phase 6F.4 backend execution is hardened on `update`; frontend execution UI remains intentionally absent.**

Branch: `update`

## 1. Business meaning

Product recontract is a controlled contract value amendment. It changes future commercial terms of an approved EMI subscription after customer consent, admin approval, accounting posting evidence, and reconciliation bridge evidence.

Historical payments, receipts, paid EMIs, waived EMIs, cancelled EMIs, lucky draw evidence, posted journals, reconciliation evidence, settlement records, day-close evidence, inventory, delivery, commission, payout, rent/lease demand, and deposit records remain immutable.

## 2. Implemented evidence chain

The execution chain is:

1. Phase 6A — saved backend preview snapshot on `ContractRecontractEvent`.
2. Phase 6B — customer consent on the saved preview.
3. Phase 6C — admin approval on the customer-accepted preview.
4. Phase 6D — future EMI schedule preview lines.
5. Phase 6E — financial impact preview.
6. Phase 6F.2 — durable accounting bridge posting and posted journal evidence.
7. Phase 6F.3 — durable reconciliation/lifecycle evidence.
8. Phase 6F.4 — final backend source mutation after all evidence verifies.
9. Phase 6F.4 hardening — explicit execution serializer fields, snapshot refresh policy, stale evidence guards, and frontend no-button regression coverage.

## 3. Execution endpoint

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

Execution runs inside `transaction.atomic()` and row-locks the amendment, event, subscription, schedule preview lines, pending EMI rows, accounting bridge evidence, and reconciliation item where practical.

## 4. Execution gates

Execution requires:

- amendment exists and status is `APPROVED`
- amendment type is `PRODUCT_CHANGE`
- latest recontract event exists
- event status is `PREVIEWED`
- event metadata is not already `EXECUTED`
- customer consent is `ACCEPTED`
- admin approval is `APPROVED`
- target product exists on the event
- schedule preview lines exist and still map exactly to current pending EMI rows
- financial impact preview exists and is `PREVIEWED`
- accounting bridge posting exists for the event and purpose `CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT`
- linked journal exists and is `POSTED`
- posted journal debit and credit totals balance
- expected financial impact amount equals posted journal amount
- reconciliation bridge item exists, is `MATCHED`, and is metadata-linked
- reconciliation expected amount equals reconciliation actual amount
- reconciliation variance is zero
- required reconciliation evidence rows exist, including the journal evidence row
- subscription is an EMI subscription and is not terminal/cancelled/closed/defaulted/completed/returned
- subscription batch and lucky ID remain intact
- no subscription-level operational cancellation record is present

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

`ContractRecontractEvent.status` remains `PREVIEWED` because the existing status enum does not include `EXECUTED`. Execution truth is stored in explicit metadata:

```text
metadata.execution_status = EXECUTED
metadata.execution_event = CONTRACT_RECONTRACT_EXECUTED
metadata.execution_performed = true
```

## 6. Snapshot behavior decision

Execution refreshes `Subscription.product_snapshot` and `Subscription.pricing_snapshot` to the executed authoritative product and financial terms.

Reason:

- existing `Subscription.save()` fills snapshots only when they are empty
- product recontract changes the current contract product and financial terms
- stale snapshots would create reporting and print/document ambiguity after execution

Historical snapshot evidence is not lost. The pre-execution product/pricing snapshot is preserved in:

```text
ContractRecontractEvent.metadata.before_subscription.product_snapshot
ContractRecontractEvent.metadata.before_subscription.pricing_snapshot
```

Execution metadata also records:

```text
product_snapshot_updated = true
pricing_snapshot_updated = true
snapshot_policy = "Subscription.product_snapshot and pricing_snapshot were refreshed to the executed authoritative product and financial terms. Prior snapshots are preserved in event metadata before_subscription."
```

## 7. Explicit serializer/reporting fields

UI and reports must not parse raw `metadata` for execution state. `ContractRecontractEventSerializer` exposes read-only fields:

```text
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
```

`ContractAmendmentSerializer.latest_product_recontract_preview` also exposes these fields for admin/customer amendment detail payloads.

## 8. Evidence references stored

Execution metadata stores:

- financial impact preview id
- accounting bridge posting id
- posted journal entry id
- reconciliation item id
- reconciliation run id
- reconciliation evidence ids
- schedule preview line ids
- expected amount
- posted amount
- zero variance
- before/after subscription snapshot
- before/after pending EMI snapshot
- updated pending EMI line details
- protected non-pending EMI ids

## 9. Records preserved by execution

Execution does not mutate:

- paid, waived, or cancelled EMI rows
- historical `Payment` rows
- `ReceiptDocument` rows
- accounting bridge postings
- posted journals
- reconciliation runs/items/evidence
- financial source lifecycle events
- bank statement lines
- UPI settlement lines
- cashier day-close records
- settlement allocations
- finance account balances
- lucky ID
- batch
- lucky draw / waiver records
- inventory / stock records
- delivery records
- commission / payout records
- rent/lease demands
- rent/lease deposits

## 10. Accounting and reconciliation role

Accounting and reconciliation are prerequisite evidence for execution. They are not created by the execution endpoint.

The execution endpoint verifies that:

- accounting bridge posting is present
- journal is posted
- expected amount equals posted journal amount
- reconciliation item is matched/linked
- reconciliation expected amount equals actual posted amount
- reconciliation evidence contains links to the event, financial preview, accounting bridge, journal, and lifecycle event

If reconciliation evidence is stale or incomplete, execution returns a controlled error and source records remain unchanged.

## 11. Atomicity

If any gate fails before or during mutation, the transaction rolls back. Subscription and pending EMI mutations must not persist on failure.

## 12. Frontend rule

No frontend execution button is added in Phase 6F.4 hardening.

A future admin UI may expose execution only with all gates visible and a typed confirmation. Required future label:

```text
Execute approved recontract
```

Required future typed confirmation:

```text
EXECUTE RECONTRACT
```

Required future warning text:

```text
This will update the subscription product, contract amount, monthly EMI, and pending EMI schedule. It will not alter historical payments, receipts, paid EMIs, accounting postings, reconciliation evidence, lucky ID, batch, stock, delivery, commission, payout, waiver, rent/lease demand, or deposit records.
```

Customer, partner, cashier, and vendor users must never see execution actions.

## 13. Compatibility

Phase 6F.4 hardening uses existing models and event metadata. No schema migration is required.
