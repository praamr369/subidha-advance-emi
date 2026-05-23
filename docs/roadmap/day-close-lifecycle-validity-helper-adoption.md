# Cashier Day Close Lifecycle Validity Helper Adoption

Status: **IMPLEMENTED ON `update` BRANCH — READ-SIDE DAY-CLOSE FILTERING ONLY**

Scope:
- `compute_system_cash_total(...)` now consumes `is_payment_valid_for_cash_evidence(payment)` for EMI payment cash evidence.
- Existing `OperationalCancellation(SourceType.EMI_PAYMENT, source_id=payment.id)` compatibility is preserved through the helper.
- Active invalidating `FinancialSourceLifecycleEvent` rows for `SourceType.EMI_PAYMENT` now exclude the payment from cashier day-close cash evidence.

## Boundaries preserved

The day-close calculation remains evidence-only and read-only:

- no payment posting changes
- no receipt generation changes
- no accounting posting changes
- no cashier collection behavior changes
- no settlement allocation behavior changes
- no reconciliation check behavior changes
- no lifecycle events are created from preview/create/read paths
- no source records are mutated

The following source records remain untouched by the calculation path:

- `Payment`
- `ReceiptDocument`
- `MoneyMovement`
- `JournalEntry`
- `FinanceAccount`
- `CashCounter`
- `SettlementAllocation`
- `ReconciliationItem`
- `FinancialSourceLifecycleEvent`

## Day-close cash evidence rule

Current included source set remains intentionally conservative:

1. `Payment.method = CASH`
2. `Payment.collected_by_id = cashier_id`
3. `Payment.payment_date = business_date`
4. Optional scope filters still apply:
   - branch
   - cash counter
   - finance account
5. The payment must pass `is_payment_valid_for_cash_evidence(payment)`.

## OperationalCancellation compatibility

`OperationalCancellation` remains the authoritative compatibility signal for existing EMI payment reversals.

A payment remains invalid for day-close cash evidence when:

```python
OperationalCancellation.objects.filter(
    source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
    source_id=payment.id,
).exists()
```

The day-close service no longer duplicates this query directly. It delegates the decision to the lifecycle validity helper so the compatibility rule stays centralized.

## Lifecycle invalidation behavior

A payment is also invalid for day-close cash evidence when an active invalidating lifecycle event exists for:

```python
FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT
```

Invalidating event types are handled by the helper/service layer. The day-close service does not infer invalidity from receipt status, journal references, text references, or metadata.

## Direct-sale receipt deferral

Direct-sale cash receipts remain excluded from cashier day-close totals in this phase unless a future explicit drawer source-link contract is approved and implemented.

This phase does not aggregate `ReceiptDocument` rows and does not infer direct-sale cash drawer evidence from receipt status, receipt source type, direct-sale references, or journal links.

## Financial integrity impact

Positive impact:
- day-close totals now respect the same canonical payment validity helper used by the lifecycle event layer
- cancelled/reversed EMI payments cannot be included merely because they remain present as `Payment` rows
- future lifecycle invalidations can be honored without weakening existing `OperationalCancellation` behavior

No accounting or cash ledger mutation occurs.

## Auditability impact

Positive impact:
- validity decision logic is centralized in the lifecycle helper
- invalidation evidence remains explicit and queryable
- read paths do not manufacture audit evidence

## Daily shop usability impact

Positive impact:
- cashier day-close preview/create totals better match valid cash evidence
- operators are not asked to handle voided/reversed EMI cash evidence manually in the day-close total

No cashier workflow steps are changed.

## Future rental/leasing compatibility

This change is additive and reusable. Future rent/lease collection evidence should adopt the same pattern:

- explicit source record
- explicit lifecycle invalidation event
- read-side validity helper
- no status/text inference
- no source mutation from preview/read paths

## Deferred

- direct-sale cash receipt inclusion
- receipt-based day-close aggregation
- rent/lease drawer evidence aggregation
- set-based query optimization for high-volume cash desks
- settlement/reconciliation behavior changes
