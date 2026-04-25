# Lucky Plan Operations (Code-Aligned)

This document describes Lucky Plan EMI behavior as implemented by current backend contracts.

## Subscription creation invariants

- Required request fields: `customer`, `product`, `plan_type`, `tenure_months`, `start_date`.
- For `plan_type=EMI`:
  - `batch` is required.
  - `tenure_months` must equal `batch.duration_months`.
  - `lucky_id` is optional in request; backend auto-assigns next available lucky ID when absent.
  - If provided, `lucky_id` must belong to the selected `batch` and be `AVAILABLE`.
- For `plan_type=RENT` or `LEASE`: `batch` and `lucky_id` must be null/blank.

## Financial computation invariants

- `total_amount` is derived from `product.base_price` at create time.
- `monthly_amount` is derived from `total_amount / tenure_months` (currency-safe rounding).
- EMI rows are generated deterministically and persisted (month number + due date + amount + status).

## Batch and Lucky ID invariants

- Batch in `OPEN` status must have exactly 100 slots.
- Lucky number range is constrained to `00–99` per batch.
- Lucky IDs are unique within a batch and cannot be reassigned across batches.

## Payment and waiver boundaries

- Payment collection must target valid EMI/subscription relationships.
- Waived EMI rows are not collectible as paid EMI rows.
- Closed/finalized subscription states are protected against unsafe collection edits.
- Reversals must remain explicit and auditable.

## Winner boundaries

- Winner status is controlled by lucky draw flows, not generic subscription edit APIs.
- Winner benefit applies to future obligations per business rules; paid history must remain intact.

## Reconciliation and audit posture

- Financial truth must remain explainable via subscription + EMI + payment + waiver + commission + payout + reconciliation records.
- If mismatch is discovered, escalate through reconciliation/admin controls; do not patch money records manually.
