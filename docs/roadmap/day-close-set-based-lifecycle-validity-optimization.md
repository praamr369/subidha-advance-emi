# Cashier Day Close Set-Based Lifecycle Validity Optimization

Status: **IMPLEMENTED ON `update` BRANCH — PERFORMANCE HARDENING ONLY**

Scope:
- Optimizes Cashier Day Close read-side validity filtering.
- Replaces per-payment lifecycle validity helper calls in `compute_system_cash_total(...)` with set-based invalidation lookup.
- Keeps business behavior unchanged.

## Code references

- `backend/reconciliation/services/financial_source_lifecycle_event_service.py`
  - `get_invalidated_payment_ids_for_cash_evidence(payment_ids)`
  - `is_payment_valid_for_cash_evidence(payment)` remains available for single-payment checks.
- `backend/settlements/services/cashier_day_close_service.py`
  - `compute_system_cash_total(...)` now fetches candidate payment IDs, resolves invalidated IDs once, and aggregates only valid payment IDs.
- `backend/tests/settlements/test_cashier_day_close_lifecycle_validity.py`
  - covers set-based helper behavior and day-close no-mutation guarantees.

## Behavior unchanged guarantee

This phase does not change:

- payment posting
- receipt generation
- accounting posting
- cashier collection behavior
- settlement allocation behavior
- reconciliation checks
- duplicate day-close behavior
- direct-sale receipt handling
- non-cash payment exclusion

The only intended change is query shape/performance.

## Included candidate payments

Candidate payments remain scoped exactly as before:

1. `Payment.method = CASH`
2. `Payment.collected_by_id = cashier_id`
3. `Payment.payment_date = business_date`
4. Optional filters:
   - branch
   - cash counter
   - finance account

## Invalidated payment IDs

`get_invalidated_payment_ids_for_cash_evidence(payment_ids)` returns a `set[int]` containing IDs invalidated by either source below.

### OperationalCancellation compatibility

Existing compatibility remains preserved:

```python
OperationalCancellation.objects.filter(
    source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
    source_id__in=payment_ids,
)
```

This keeps historical and current EMI payment reversal/cancellation behavior intact.

### FinancialSourceLifecycleEvent invalidation

Lifecycle invalidation is resolved by explicit active lifecycle evidence:

```python
FinancialSourceLifecycleEvent.objects.filter(
    source_type=FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT,
    source_id__in=payment_ids,
    event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
    event_type__in=INVALIDATING_EVENT_TYPES,
)
```

The helper intentionally uses the code-backed `EMI_PAYMENT` lifecycle source type. It does not introduce a raw string source type such as `"Payment"`, because that would diverge from the existing `FinancialSourceLifecycleEvent.SourceType` contract.

## Read-path creation remains forbidden

The set-based helper must never create lifecycle events. It performs only SELECT queries and returns IDs.

Forbidden in this path:

- `FinancialSourceLifecycleEvent.objects.create(...)`
- receipt voiding
- payment reversal
- accounting posting
- allocation creation
- reconciliation item creation
- mutation of `Payment`, `ReceiptDocument`, `MoneyMovement`, `JournalEntry`, `FinanceAccount`, `CashCounter`, `SettlementAllocation`, `ReconciliationItem`, or `FinancialSourceLifecycleEvent`

## Direct-sale receipts remain deferred

Direct-sale cash receipts remain excluded from Cashier Day Close `system_cash_total` in this phase.

This phase does not aggregate `ReceiptDocument` rows and does not infer drawer evidence from:

- direct-sale receipt status
- receipt source type
- receipt text/reference fields
- journal presence
- reversal journal presence

Direct-sale receipt inclusion still requires a future explicit drawer source-link contract.

## Financial integrity impact

Positive, with no behavior change:

- invalidated EMI cash payments remain excluded
- valid EMI cash payments remain included
- non-cash payments remain excluded
- branch/counter/account scoping remains deterministic
- system cash total remains a read-only evidence snapshot

## Auditability impact

Positive:

- validity evidence still flows through explicit `OperationalCancellation` and `FinancialSourceLifecycleEvent` records
- single-payment and set-based helpers share the same invalidation rules
- no audit evidence is manufactured from previews or day-close creation

## Daily shop usability impact

Operational behavior is unchanged. Cashier preview/create totals should be the same as the previous lifecycle-helper implementation, with better scalability for busier cash desks.

## Future compatibility

This optimization keeps the read-helper pattern suitable for future rental/leasing collection evidence:

- collect candidate source IDs
- fetch invalidated IDs using explicit lifecycle evidence
- aggregate only valid candidates
- avoid status/text inference
- avoid read-path mutation
