# Subscription Cancellation Lucky ID Release Workflow

## Purpose

Operational workflow for cancelling EMI subscriptions with controlled Lucky ID release behavior.

## Preconditions

- Actor must be admin-authorized to cancel subscriptions.
- Cancellation reason is mandatory.
- If payments exist, existing cancellation guardrails still apply.

## Workflow

1. Cancel subscription through admin contract cancellation flow.
2. System marks pending EMIs as cancelled and sets subscription status to `CANCELLED`.
3. System evaluates batch status and applies release guard:
   - `DRAFT`/`OPEN`: Lucky ID released and becomes assignable.
   - Frozen statuses (`READY_TO_LOCK`, `LOCKED`, `DRAW_COMMITTED`, `DRAW_COMPLETED`, `CANCELLED`): Lucky ID remains frozen and non-assignable.
4. System writes cancellation and Lucky ID release/block audit metadata.

## UI Expectations

- Subscription create flow only allows Lucky IDs with `assignable=true`.
- Released pre-lock Lucky IDs may show release note:
  - `Released from cancelled contract — available for reassignment`
- Frozen cancelled holders show non-assignable guidance:
  - `Frozen after lock — not assignable`

## Operational Checks

- Cancelled subscription remains visible in history/audit.
- Cancelled subscription is excluded from active collectible/overdue operational surfaces.
- Draw lock/commit/reveal behavior is unchanged.
