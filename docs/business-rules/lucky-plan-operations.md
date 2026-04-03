# Lucky Plan Operations

This document translates the current Lucky Plan EMI code paths into day-to-day operational rules.

## 1. Product and contract rules

- `Product.base_price` is treated as the full contract amount for Lucky Plan EMI.
- For EMI subscriptions, `Subscription.total_amount` is derived from the product base price.
- `Subscription.monthly_amount` is derived from total amount divided by tenure.
- EMI schedule rows are generated deterministically from the subscription contract.

## 2. Batch and lucky ID rules

- Lucky Plan EMI subscriptions require a batch and a lucky ID.
- `Batch.status=OPEN` is the selling state for Lucky Plan EMI onboarding.
- An `OPEN` batch must have exactly `100` total slots.
- Lucky IDs are unique inside a batch and are restricted to lucky numbers `00` through `99`.
- A lucky ID used by an EMI subscription must belong to the selected batch.
- If the subscription create flow is called without `lucky_id` for EMI, the backend will auto-assign the next available lucky ID in that batch.

## 3. Subscription onboarding rules

- `customer`, `product`, `plan_type`, `tenure_months`, and `start_date` are required for subscription creation.
- For `plan_type=EMI`, `batch` is required.
- For `plan_type=EMI`, tenure must exactly match `Batch.duration_months`.
- For `plan_type=RENT` or `plan_type=LEASE`, `batch` and `lucky_id` must remain blank.
- New subscriptions start with computed financial fields and a live EMI schedule if the plan type is EMI.
- The subscription create flow computes `total_amount` and `monthly_amount`; operators should not try to override those values in onboarding files.

## 4. Payment and collection rules

- Counter collection is a cashier/admin payment flow tied to EMI records.
- Payment amount must be positive and tied to a valid EMI/subscription relationship.
- Waived EMI rows cannot be collected as paid EMI rows.
- Closed or finalized subscriptions cannot be handled like open collections.
- Payment reversals must remain explicit and auditable.

## 5. Winner and waiver rules

- Winner state is not a free-form subscription edit.
- Winner handling is assigned only through the lucky draw reveal flow.
- Winner benefit applies to future EMI waiver only.
- Already paid EMI rows are not silently rewritten by winner handling.
- Waived EMI totals and paid EMI totals must remain separately visible.

## 6. Partner rules

- Partner linkage on a subscription is optional and partner-scoped.
- Partner collection paths in the current system submit collection requests.
- Partner submission is not final payment truth until admin approval or the canonical posting flow completes.
- Commission and payout behavior must remain tied to approved, persisted financial records.

## 7. Reconciliation and audit rules

- Reconciliation must remain explainable from persisted subscription, EMI, payment, waiver, commission, and ledger records.
- Payment history should remain append-only in spirit.
- Audit-sensitive state changes should use the existing service and admin flows, not ad-hoc data edits.
- If an operator finds historical mismatch, escalate through admin reconciliation rather than editing rows manually.

## 8. Operational boundaries

- Use Lucky Plan EMI workflows for current day-to-day operations.
- Keep RENT and LEASE compatibility intact, but do not treat those future modes as a reason to weaken Lucky Plan controls today.
- When onboarding data, preserve identifiers and relationships before collecting any live payments.
