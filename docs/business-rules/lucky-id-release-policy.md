# Lucky ID Release Policy (Option A)

## Scope

This policy governs Lucky ID reuse when an EMI subscription is cancelled.

## Core Rule

- Subscription cancellation is always audit-preserving: cancelled subscription rows are never deleted.
- Lucky ID release is allowed only before draw-lock stages.

## Release Matrix

- **Release allowed**: batch status `DRAFT`, `OPEN`.
  - Subscription becomes `CANCELLED`.
  - Subscription Lucky ID link is cleared (`subscription.lucky_id = null`).
  - Lucky ID returns to `AVAILABLE`.
  - Lucky ID is assignable again before lock.
- **Release blocked (frozen)**: batch status `READY_TO_LOCK`, `LOCKED`, `DRAW_COMMITTED`, `DRAW_COMPLETED`, `CANCELLED`.
  - Subscription becomes `CANCELLED`.
  - Subscription Lucky ID stays linked for history/legal draw traceability.
  - Lucky ID is not assignable.

## Audit Requirements

Every cancellation records a Lucky ID release audit event (or blocked-release event) with:

- batch id/code
- lucky id / lucky number
- old subscription id
- old customer id
- cancellation reason
- actor
- release timestamp

## Guardrails

- No changes to EMI calculation.
- No changes to payment posting.
- No changes to reconciliation.
- No changes to waiver logic.
- No changes to draw commit/reveal semantics.
- No changes to commission/payout behavior.
