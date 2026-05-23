# Financial Source Lifecycle Event Design

Status: **DESIGN ONLY**
Scope: additive lifecycle/evidence events for payment, receipt, money movement, and future settlement source validity.

## 1) Objective

Design a safe, additive canonical validity-event layer for financial source lifecycle evidence without changing:
- payment posting
- receipt generation
- accounting posting
- cashier day-close logic
- settlement allocation logic
- reconciliation checks
- underlying source records for existing Payment, ReceiptDocument, MoneyMovement, JournalEntry, FinanceAccount, CashCounter

This is a read-only design phase. No models, migrations, APIs, services, or frontend changes are implemented here.

## 2) Current gap

Current authoritative evidence today is uneven:

- `OperationalCancellation(SourceType.EMI_PAYMENT)` is the only explicit invalidation signal for EMI payment reversal.
- `ReceiptDocument` voiding is signaled only by `ReceiptDocument.status = VOID` + reversal journal behavior.
- `ReceiptDocument.posted_journal_entry` can remain on a voided receipt, so journal presence is not proof of an active receipt.
- Cashier day-close currently excludes only `Payment` rows cancelled via `OperationalCancellation`.
- Settlement reconciliation cannot reliably exclude invalid receipts or source records without a first-class lifecycle event.

## 3) Option evaluation

### Option A: Reuse / extend `OperationalCancellation`

- schema fields: existing `OperationalCancellation` fields plus potential audit metadata.
- source link style: `source_type`/`source_id` across all invalidated sources.
- write points: payment reversal, receipt void, invoice cancellation, delivery cancel.
- compatibility: direct reuse; current payment cancellation flow remains unchanged.
- cashier day-close impact: could extend exclusion to receipt invalidation if receipt void service also created `OperationalCancellation(SourceType.BILLING_RECEIPT)`.
- settlement reconciliation impact: could provide deterministic receipt invalidation evidence if supported.
- receipt/PDF audit impact: better than current status-only inference, but still a cancellation-only record; not a full lifecycle event history.
- migration risk: moderate because `OperationalCancellation` has a unique constraint on `(source_type, source_id)` and a cancellation-specific semantics model.
- backfill need: none for new events, but existing receipt voids would remain unrepresented unless backfilled or instrumented through a new event model.
- false-positive risk: moderate if `OperationalCancellation` semantics are overloaded beyond cancellation.
- implementation complexity: low at the model level, but medium at the semantic level because it would mix cancellation events with broader lifecycle evidence.

### Option B: New `PaymentValidityEvent` only

- schema fields: payment-specific lifecycle event table.
- source link style: `payment_id` FK.
- write points: payment creation/posting, reversal, related cancellation.
- compatibility: preserves `OperationalCancellation` for existing payment reversal authority.
- cashier day-close impact: could replace or augment the current `OperationalCancellation` filter.
- settlement reconciliation impact: limited to payment validity; receipts and money movements remain outside the contract.
- receipt/PDF audit impact: none.
- migration risk: low.
- backfill need: none if used from implementation forward.
- false-positive risk: low for payments only.
- implementation complexity: low, but narrow scope.

### Option C: New `DocumentLifecycleEvent` / `ReceiptValidityEvent` only

- schema fields: receipt/document lifecycle event table.
- source link style: `receipt_id` or document-level generic source reference.
- write points: receipt creation, receipt void, direct-sale receipt refund, billing receipt refund.
- compatibility: preserves existing `OperationalCancellation` for payments.
- cashier day-close impact: addresses only receipt invalidation for cashier evidence.
- settlement reconciliation impact: addresses only receipt validity; payment and movement evidence still requires separate contracts.
- receipt/PDF audit impact: strong for receipts, but only partial system coverage.
- migration risk: low.
- backfill need: none for future events.
- false-positive risk: low for receipts only.
- implementation complexity: low, but not unified.

### Option D: Generic `FinancialSourceLifecycleEvent`

- schema fields: generic event table with `event_no`, `source_type`, `source_id`, `event_type`, `event_status`, `reason`, `amount`, `created_by`, `created_at`, optional related FKs (`payment`, `receipt`, `invoice`, `journal`, `cancellation`), `metadata`.
- source link style: generic `source_type/source_id` plus optional typed FKs for convenience and query optimization.
- write points: payment creation/posting, payment reversal, operational cancellation creation, receipt creation, receipt void/reversal, direct-sale receipt refund/cancellation, money movement reversal, settlement import lifecycle events if needed.
- compatibility: additive; `OperationalCancellation` continues as existing cancellation evidence and may be linked via `related_cancellation`.
- cashier day-close impact: can unify exclusion logic for invalidated `Payment` and `ReceiptDocument` sources.
- settlement reconciliation impact: can provide canonical validity evidence for receipts and future settlement source events while preserving current reconciliation contracts.
- receipt/PDF audit impact: enables explicit audit trails for receipt validity without changing generated documents.
- migration risk: low to moderate; additive model only, no source-row schema changes required.
- backfill need: none required; future events can be appended only.
- false-positive risk: low if event types/statuses are explicit and logic only uses active/invalidating event sets.
- implementation complexity: moderate; adds one generic model but avoids multiple narrow event tables and future refactoring.

## 4) Recommended model design

**Recommend Option D: Add a generic `FinancialSourceLifecycleEvent` model.**

Rationale:

- adds a single, reusable event layer for `Payment`, `ReceiptDocument`, `MoneyMovement`, and future settlement evidence sources.
- keeps `OperationalCancellation` intact as the current authoritative payment cancellation mechanism.
- avoids overloading `OperationalCancellation` with non-cancellation lifecycle semantics.
- does not require rewriting historical payment or receipt rows.
- supports append-only audit history and explicit invalidation events.

### 4.1 Suggested schema fields

- `event_no` (CharField, unique, audit-friendly identifier)
- `source_type` (TextChoices)
- `source_id` (PositiveBigIntegerField)
- `event_type` (TextChoices)
  - `POSTED`
  - `REVERSED`
  - `VOIDED`
  - `CANCELLED`
  - `REFUNDED`
  - `ADJUSTED`
  - `SUPERSEDED`
- `event_status` (TextChoices)
  - `ACTIVE`
  - `SUPERSEDED`
  - `VOIDED`
- `reason` (TextField)
- `amount` (DecimalField, null=True, blank=True)
- `created_by` (FK to `AUTH_USER_MODEL`)
- `created_at` (DateTimeField)
- `related_payment` (FK, nullable)
- `related_receipt` (FK, nullable)
- `related_invoice` (FK, nullable)
- `related_journal` (FK, nullable)
- `related_cancellation` (FK to `OperationalCancellation`, nullable)
- `metadata` (JSONField, blank=True, default=dict)

### 4.2 Suggested `source_type` values

- `PAYMENT`
- `BILLING_RECEIPT`
- `MONEY_MOVEMENT`
- `BANK_STATEMENT_LINE`
- `UPI_SETTLEMENT_LINE`
- `CASHIER_DAY_CLOSE`
- `OTHER`

### 4.3 Write points

The design should plan, in future implementation, to append lifecycle events at the following secure service boundaries:

- payment creation/posting (event_type=`POSTED`)
- payment reversal (event_type=`REVERSED`)
- OperationalCancellation creation for EMI payment reversal (event_type=`CANCELLED` or `SUPERSEDED` if linked)
- receipt creation/generation (event_type=`POSTED`)
- receipt void / receipt reversal (event_type=`VOIDED`)
- direct-sale/billing receipt refund or cancellation (event_type=`CANCELLED`/`REFUNDED`)
- money movement reversal or invalidation (event_type=`REVERSED`/`VOIDED`)
- future settlement import lifecycle events if a settlement line becomes `IGNORED` or `MATCHED` (event_type=`POSTED` / `SUPERSEDED` / `VOIDED` as needed)

No event should automatically post accounting or mutate the underlying source record.

### 4.4 Compatibility with `OperationalCancellation`

- Keep `OperationalCancellation` as the existing authoritative cancellation evidence for EMI payment reversals and other domain-level cancellation workflows.
- The new event model may reference `OperationalCancellation` via `related_cancellation` when a cancellation event occurs.
- A backward-compatible read helper should consider both:
  - existing `OperationalCancellation` evidence, and
  - new `FinancialSourceLifecycleEvent` invalidation rows.
- This avoids forcing an immediate rewrite of current payment reversal flows.

## 5) Read helpers

The implementation should expose additive read helpers for deterministic validity queries:

- `is_payment_valid_for_cash_evidence(payment)`
- `is_receipt_valid_for_settlement(receipt)`
- `get_latest_lifecycle_event(source_type, source_id)`
- `get_invalidating_events(source_type, source_id)`

Supporting helpers may include:

- `get_active_lifecycle_event(source_type, source_id)`
- `get_lifecycle_history(source_type, source_id)`
- `is_source_invalidated(source_type, source_id)`

Event logic should only treat a source as invalidated when explicit invalidating events exist; it should not infer validity from legacy status fields alone.

## 6) Cashier day-close impact

The cashier day-close evidence layer should be updated in a later phase to:

- continue to exclude payments cancelled by `OperationalCancellation(SourceType.EMI_PAYMENT)` for backward compatibility
- optionally use `FinancialSourceLifecycleEvent` invalidation events for payments and receipts once the event layer is live
- avoid inferring receipt validity from `ReceiptDocument.posted_journal_entry`
- keep `compute_system_cash_total()` read-only and evidence-only; any new filter should only add explicit invalidity criteria

## 7) Settlement reconciliation impact

The reconciliation layer can remain unchanged in this phase.

Once the lifecycle event model exists, settlement checks should:

- use `FinancialSourceLifecycleEvent` invalidation events to determine whether a receipt or money movement is active
- not assume `ReceiptDocument.status = POSTED` or `posted_journal_entry` presence means an active receipt
- continue using existing explicit links through `AccountingBridgePosting`, `JournalEntry.source_model/source_id`, and `SettlementAllocation` for deterministic evidence

## 8) Receipt / PDF / audit impact

A generic lifecycle event model improves auditability without changing receipt document or PDF behavior:

- receipt PDFs remain generated from `ReceiptDocument` state as today
- receipt validity in audit trails becomes explicit and queryable
- invalidated receipts can be shown with a deterministic evidence chain (`FinancialSourceLifecycleEvent` + `related_journal` + `related_cancellation`) without changing existing document templates

## 9) Migration risk and historical data strategy

- Additive model design: low migration risk.
- No schema changes to `Payment`, `ReceiptDocument`, `MoneyMovement`, `JournalEntry`, `FinanceAccount`, or `CashCounter` are required.
- No historical backfill is required for the first implementation. Existing historical invalidation evidence can remain inferred via `OperationalCancellation` and receipt status until a later backfill phase if desired.
- Because the model is append-only, there is no risk of rewriting past financial source rows.

## 10) Recommended implementation path

1. Document and approve the generic lifecycle event design.
2. Add the generic event model in a reconciliation/audit boundary.
3. Add read helpers and a small set of non-invasive write points for future use.
4. Extend cashier day-close and settlement reconciliation logic to consume explicit event evidence.
5. Continue to preserve `OperationalCancellation` as the existing payment cancellation anchor.
6. Reserve historical backfill for a future optional phase only if the business needs retroactive validity reporting.

## 11) Why this design is additive and safe

- It adds a separate event table without mutating source records.
- It does not require rewriting or repairing historical data.
- It keeps payment and receipt posting behavior unchanged.
- It preserves existing `OperationalCancellation` semantics while allowing a more general lifecycle evidence layer.
- It creates explicit invalidation evidence, reducing inference and false positives in cashier-day-close and settlement reconciliation.
