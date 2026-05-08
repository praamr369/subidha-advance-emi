# Frontend Loading and Cache Policy

This policy describes safe frontend cache and loading behavior for SUBIDHA CORE operational surfaces.

## Scope

- Applies to read-only summary and lookup endpoints used by dashboards, sidebars, and suggestion inputs.
- Does not apply to financial posting or mutation endpoints.

## Cache Rules

- Use short-lived cache windows for operational reads.
- Invalidate related queries after successful mutations.
- Clear client cache on logout to avoid cross-user leakage.
- Avoid persisting sensitive financial mutation responses.

## Recommended Read Cache Targets

- Dashboard summary payloads
- Navigation badge counters
- Notification summaries
- Return-eligibility previews
- Suggestion/search lists for forms

## Mutation Safety

- After posting actions (returns, refunds, reversals, collections), force refetch for impacted summary and table data.
- Keep mutation responses uncached unless explicitly needed for immediate UI confirmation.

## Loading and Skeleton Policy

- Show skeletons or loading blocks for:
  - dashboard KPIs
  - operational table pages
  - async suggestions in forms
  - heavy detail panels/drawers
- Avoid layout shift by reserving section height where possible.

## Error Presentation

- Translate backend API failures into operator-readable messages.
- Keep field-level errors near inputs and reserve global errors for unknown failures.
- Avoid exposing constraint names or internal object keys in default UI.
