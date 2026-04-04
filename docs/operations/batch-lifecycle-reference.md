# Batch Lifecycle Reference

This note is the live-ops reference for the current `BatchStatus` model and the guarded admin transition flow.

## Canonical batch statuses

The current backend enum in `backend/subscriptions/models.py` is:

- `DRAFT`
- `OPEN`
- `FULL`
- `DRAW_IN_PROGRESS`
- `COMPLETED`
- `CLOSED`

`ACTIVE` and `CANCELLED` are not current batch statuses and should not be used for batch operations, filters, or admin transitions.

## Canonical transition sequence

The guarded transition path matches `backend/subscriptions/services/batch_service.py`:

- `DRAFT -> OPEN`
- `OPEN -> FULL`
- `OPEN -> DRAW_IN_PROGRESS`
- `FULL -> DRAW_IN_PROGRESS`
- `DRAW_IN_PROGRESS -> COMPLETED`
- `COMPLETED -> CLOSED`

`CLOSED` is terminal in the current batch service.

## Admin transition guard expectations

The admin batch transition endpoint now validates against the canonical map and keeps the following non-financial readiness checks in place:

- `OPEN` requires exactly `100` total slots.
- `OPEN` requires Lucky IDs to be fully prepared for the batch.
- `FULL` requires Lucky IDs to match `total_slots`.
- `FULL` requires zero remaining `AVAILABLE` Lucky IDs.
- `DRAW_IN_PROGRESS` requires Lucky IDs to match `total_slots`.
- `COMPLETED` requires at least one persisted draw record.

Draw-specific business checks still remain in the existing lucky draw services and endpoints. This document does not change draw winner, EMI waiver, payment, commission, payout, reconciliation, or audit behavior.

## Operational meaning

- `DRAFT`: batch shell exists, still safe for pre-live setup.
- `OPEN`: batch is ready for live subscription onboarding.
- `FULL`: batch has no remaining available Lucky IDs.
- `DRAW_IN_PROGRESS`: batch is in the guarded draw execution stage.
- `COMPLETED`: draw execution stage has been completed for the current lifecycle.
- `CLOSED`: terminal closed state for the current batch lifecycle flow.

## Admin UI expectations

The admin batch register, detail page, and edit page should:

- display only the canonical batch statuses above
- stop offering `ACTIVE` or `CANCELLED` as batch status filters or transitions
- offer only the next allowed canonical status on the edit page
- treat `OPEN`, `FULL`, and `DRAW_IN_PROGRESS` as the live batch states in operational summaries

## Related audit note

The original drift and remediation context is documented in `docs/operations/live-ops-gap-report.md`.
