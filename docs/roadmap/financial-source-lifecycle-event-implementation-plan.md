# Financial Source Lifecycle Event Implementation Plan

Status: **PHASE 1 SCHEMA FOUNDATION IMPLEMENTED**
Scope: additive implementation phases for a canonical validity-event layer covering payment, receipt, money movement, and future settlement evidence.

## 1) Goal

Deliver a safe, additive lifecycle evidence layer that:

- does not change payment posting or receipt generation
- does not change accounting posting
- does not change cashier day-close logic
- does not change settlement allocation logic
- does not change reconciliation checks in the first phase
- does not mutate `Payment`, `ReceiptDocument`, `MoneyMovement`, `JournalEntry`, `FinanceAccount`, `CashCounter`, or source records
- does not require historical backfill or auto-correct existing data
- preserves `OperationalCancellation` as the current authoritative cancellation anchor

## 2) Key principles

- Append-only events only
- Explicit invalidation evidence preferred over status inference
- No event should post accounting automatically
- No event should mutate source records automatically
- New event layer should be read-only for existing flows until fully validated
- Existing source links remain the deterministic foundation for reconciliation

## 3) Phase plan

### Phase 0: Design and audit alignment

Status: design only.

Deliverables:
- `docs/architecture/financial-source-lifecycle-event-design.md`
- updated validity-audit docs to reflect the design gap and preferred path
- updated settlement/day-close/reconciliation roadmaps to call out the dependency on explicit lifecycle event evidence

Acceptance criteria:
- design is reviewed and approved by domain owners
- no model or code changes are made in this phase
- implementation plan contains explicit write/read boundary definitions

### Phase 1: Add generic event model schema

Goal: add a standalone `FinancialSourceLifecycleEvent` model in an audit/reconciliation boundary.

Status: **IMPLEMENTED IN SCHEMA FOUNDATION**

This phase added the additive `FinancialSourceLifecycleEvent` model and read helper services in `backend/reconciliation` without wiring any write points to payment, receipt, or reconciliation flows.

Scope:
- new model only
- no source modifications
- no lifecycle event write points wired yet

Core fields:
- `event_no`
- `source_type`, `source_id`
- `event_type`
- `event_status`
- `reason`, `amount`, `metadata`
- optional `related_payment`, `related_receipt`, `related_invoice`, `related_journal`, `related_cancellation`
- audit fields: `created_by`, `created_at`

Design constraints:
- no automatic accounting posting
- no automatic source-state mutation
- no inference of validity from existing status fields
- `OperationalCancellation` remains unaffected

Acceptance criteria:
- model exists with required fields and indexes
- documentation clearly states the event layer is not yet used for active reconciliations
- tests cover model validation and schema constraints only

### Phase 2: Add event write points for lifecycle changes

Goal: record explicit lifecycle events at service boundaries without changing the semantics of posting/receipt generation.

Write points to implement:
- payment creation/posting service path: append `POSTED` event eventually
- payment reversal service path: append `REVERSED` event
- `OperationalCancellation` creation path: optionally append a linked `CANCELLED` or `SUPERSEDED` event
- receipt creation/generation path: append `POSTED` or equivalent event (future safe path)
- receipt void/reversal path: append `VOIDED` event
- direct-sale or billing receipt refund/cancellation path: append `REFUNDED`/`CANCELLED` event
- money movement reversal path: append `REVERSED`/`VOIDED` event if applicable

Constraints:
- no change to transaction-accounting flows
- no new journal posting triggers
- events are audio-only evidence records
- existing `OperationalCancellation` flows continue unchanged

Acceptance criteria:
- lifecycle events are written only at the service layer boundaries above
- existing business behavior remains unchanged
- no payment/receipt source rows are mutated solely because of event creation

### Phase 3: Add read helpers and deterministic evidence queries

Goal: make lifecycle event evidence usable without changing cash/settlement behavior.

Required helpers:
- `is_payment_valid_for_cash_evidence(payment)`
- `is_receipt_valid_for_settlement(receipt)`
- `get_latest_lifecycle_event(source_type, source_id)`
- `get_invalidating_events(source_type, source_id)`

Additional helpers:
- `is_source_invalidated(source_type, source_id)`
- `get_active_lifecycle_event(source_type, source_id)`

Usage:
- helper logic should consider both explicit lifecycle events and existing `OperationalCancellation` evidence when computing validity for backward compatibility.
- helper logic should never infer validity from `ReceiptDocument.posted_journal_entry` or `ReceiptDocument.status` alone.

Acceptance criteria:
- helper tests cover active/invalidated/voided sources
- helper tests preserve current payment reversal semantics via `OperationalCancellation`
- helper logic is modular and can be reused by cashier day-close and reconciliation services

### Phase 4: Consume event evidence in reconciliation and cashier logic

Goal: update day-close and reconciliation checks to consume explicit validity events safely.

Implementation notes:
- keep current `compute_system_cash_total` behavior unchanged until validation
- add new guarded filter paths for explicit invalidation events when the evidence layer is active
- do not alter existing cashier day-close totals or settlement allocations until the event layer is validated in a separate release

Possible checks:
- cash evidence should exclude payments and receipts with invalidating lifecycle events
- settlement reconciliation should mark voided receipts and reversed money movements as invalid for source totals
- receipt/PDF audit views can surface invalidation event metadata without changing document generation

Acceptance criteria:
- reconciliation tests demonstrate explicit invalidation events changing validity decisions without source row mutation
- no auto-correction or world-state mutation occurs

### Phase 5: Extend event layer to settlement import evidence (future)

Goal: support future settlement source lifecycle events for bank statement lines, UPI settlement lines, and cashier day-close records.

Scope:
- extend `FinancialSourceLifecycleEvent.source_type` to include settlement evidence sources
- use event rows to record lifecycle transitions such as `POSTED`, `SUPERSEDED`, `VOIDED`, `IGNORED`
- integrate with settlement allocation and reconciliation workflows

Acceptance criteria:
- future settlement evidence can be recorded as explicit lifecycle events without mutating imported statement data
- warning: this is a later phase and may require policy work on settlement import lifecycle semantics

## 4) Historical data / backfill strategy

- No backfill is required for the first implementation.
- Existing history remains available through `OperationalCancellation` and current receipt status/journal inference.
- If the business later decides a retroactive validity audit is needed, a separate backfill phase can be scoped explicitly.
- For now, the event layer is forward-looking only.

## 5) Tests and validation

Phase 0/1 should include:
- schema tests for the new event model
- validation tests for event type/status combinations
- event query/index performance reasoning

Phase 2/3 should include:
- service-level tests for each new write point
- helper tests for active/invalidated source queries
- compatibility tests that preserve `OperationalCancellation` behavior

Phase 4 should include:
- reuse or extend existing reconciliation tests, focusing on explicit event-based validity decisions
- cashier day-close tests that compare current totals with event-filtered totals
- regression tests ensuring no source record mutation occurs

## 6) Why this phase plan is safe

- It separates schema design from service wiring from consumption.
- It preserves existing business behavior until the event layer is validated.
- It makes the lifecycle evidence additive and audit-only first.
- It keeps `OperationalCancellation` working while enabling a more general validity event contract.
- It prevents premature reconciliation changes by postponing consumption until explicit events are available.
