# Batch Subscription Visibility Rules

## Active vs History
- Cancelled/closed/completed/defaulted/won subscriptions are history-only records.
- History rows stay visible in subscription history, customer history, and audit trails.
- History rows must not be counted as active batch business.

## Batch Summary Rules
- `active_subscription_count` includes only operationally active subscriptions.
- `active_monthly_booked_value` excludes cancelled/history subscriptions.
- `active_contract_value` excludes cancelled/history subscriptions.
- `draw_eligible_count` excludes cancelled/history subscriptions.
- `historical_subscription_count` tracks non-active rows preserved for audit.

## Lucky ID Register Rules
- Current assignment fields (`current_*`) must only represent active assignment.
- Available Lucky IDs must render as unassigned in current assignment columns.
- Cancelled holders are shown only through history fields (`historical_*`, `history_label`).

## Linked Subscriptions UI Rules
- Active section shows operationally active subscriptions only.
- Cancelled/archived/completed/defaulted/won subscriptions render in history-only section.
- History section must not expose active actions such as collection or draw eligibility.

## Audit and Safety
- Subscription, Lucky ID, EMI, payment, receipt, journal, and audit rows are never deleted for this visibility rule.
- This rule is read/visibility-only and does not change posting logic.
