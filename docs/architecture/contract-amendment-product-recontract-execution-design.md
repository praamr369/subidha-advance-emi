# Contract Amendment Product Recontract Execution Design

Status: **Phase 6F.3 reconciliation bridge is implemented on `update`; final product recontract execution remains blocked**

Branch: `update`

## 1. Business meaning

Product recontract is not a simple product reference correction. It changes future commercial terms after customer consent and admin approval. Historical payments, receipts, paid EMIs, waived EMIs, lucky draw evidence, posted journals, settlement records, and day-close evidence must stay immutable.

Current implementation supports evidence creation up to reconciliation bridge. It does not perform final source mutation.

## 2. Implemented stages

### Phase 6A — Preview snapshot

Admin saves a backend-calculated `ContractRecontractEvent` snapshot. No source records are mutated.

### Phase 6B — Customer consent

Customer records `ACCEPTED` or `REJECTED` against the active saved preview. No source records are mutated.

### Phase 6C — Admin decision

Admin records `APPROVED` or `REJECTED` after customer consent. No source records are mutated.

### Phase 6D — Schedule preview

Admin creates `ContractRecontractScheduleLine` preview rows for future/pending EMI changes. Real EMI rows remain unchanged.

### Phase 6E — Financial impact preview

Admin creates `ContractRecontractFinancialImpactPreview` evidence. No journals, reconciliation items, settlements, receipts, payments, or EMI rows are created or changed.

### Phase 6F.2 — Accounting posting evidence

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/accounting-posting/
```

Creates durable accounting evidence through existing accounting bridge infrastructure:

- `AccountingBridgePosting`
- posted `JournalEntry`
- `JournalEntryLine`
- audit metadata
- `ContractRecontractEvent.metadata` posting references

This is accounting evidence only. It does not execute the product change, update subscription terms, rewrite EMI rows, create payments, create receipts, mutate settlement/day-close records, or touch rent/lease demand/deposit records.

### Phase 6F.3 — Reconciliation bridge evidence

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/reconciliation-bridge/
```

Creates durable reconciliation/lifecycle evidence through existing reconciliation infrastructure:

- `ReconciliationRun`
- `ReconciliationItem`
- `ReconciliationEvidence`
- `FinancialSourceLifecycleEvent`

The bridge links:

- `ContractRecontractEvent`
- `ContractRecontractFinancialImpactPreview`
- `AccountingBridgePosting`
- posted `JournalEntry`
- expected adjustment amount
- actual posted amount
- lifecycle event evidence

Expected and posted amounts must match exactly. Variance returns a controlled error and does not write reconciliation evidence.

## 3. Current blocked execution endpoint

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

The endpoint remains blocked. It validates the event gates and returns controlled 400 before any mutation. No frontend execution button is exposed.

Final execution must not be enabled until Phase 6F.4 completes.

## 4. Source records preserved through 6F.3

Phase 6F.3 does not mutate:

- `Subscription.product`
- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- real `Emi` rows
- `Payment` rows
- `ReceiptDocument` rows
- finance account balances
- bank statement lines
- UPI settlement lines
- cashier day-close rows
- settlement allocations
- inventory or stock records
- delivery records
- commission or payout records
- waiver records
- lucky draw, lucky ID, or batch records
- rent/lease demand or deposit records

## 5. Final execution requirements — Phase 6F.4

Final execution may be enabled only after all required evidence exists and can be verified in one transaction:

- active saved recontract event exists
- customer consent is `ACCEPTED`
- admin approval is `APPROVED`
- schedule preview lines exist
- financial impact preview exists
- accounting bridge posting exists and journal is posted
- reconciliation bridge evidence exists and is linked
- expected adjustment amount equals posted journal amount
- pending EMI rows still match schedule preview source IDs
- no blocking cancellation, return, reversal, refund, dispute, or in-flight payment collection exists
- no previous execution metadata exists

## 6. Future execution transaction shape

Phase 6F.4 must:

1. Lock amendment, recontract event, subscription, financial preview, schedule preview lines, reconciliation evidence, and pending EMI rows.
2. Verify accounting and reconciliation bridge evidence.
3. Mutate only approved subscription and pending EMI fields from persisted preview lines.
4. Preserve all historical payment, receipt, paid EMI, waiver, draw, accounting, settlement, day-close, inventory, delivery, commission, payout, rent/lease demand, and deposit evidence.
5. Mark execution metadata and emit audit/business events.
6. Fail atomically if any verification or mutation fails.

## 7. UI rule

Frontend may show accounting/reconciliation evidence read-only for admin. It must not show final execution controls until backend execution readiness is explicitly implemented.

Forbidden labels before Phase 6F.4:

- Execute recontract
- Apply product change
- Update contract
- Recalculate EMI now
- Reconcile now

## 8. Compatibility

All implemented phases are additive and preserve existing data. No destructive migration is required for Phase 6F.3 because it reuses existing reconciliation and lifecycle models.
