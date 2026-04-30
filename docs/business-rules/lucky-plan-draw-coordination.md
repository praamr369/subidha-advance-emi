# Lucky Plan — batch lock and draw coordination

This document describes **Pass 7** backend coordination: lifecycle, eligibility snapshots, commit hash, idempotent draw execution, waivers, delivery/inventory hooks, and partner commission boundaries. It is additive to existing EMI, payment, and reconciliation behavior.

## Batch lifecycle (coordination)

Statuses include existing values plus:

- `READY_TO_LOCK` — optional gate before lock  
- `LOCKED` — eligibility frozen; snapshots created at lock  
- `DRAW_COMMITTED` — `DrawCommit` + month-1 `LuckyDraw` created; public hash published  
- `DRAW_COMPLETED` — draw revealed, winner follow-up executed, batch advanced  
- `CANCELLED` — terminal  

Legacy statuses (`DRAW_IN_PROGRESS`, `COMPLETED`, `CLOSED`) remain for historical batches.

### Lock rules

`POST /api/v1/admin/batches/{id}/lock/` (optional body: `minimum_active` integer for operational floors) runs `lock_batch_for_draw`:

- Batch must be `FULL` or `READY_TO_LOCK` (production path).  
- All Lucky IDs must be assigned; active count must meet threshold (default: `total_slots`).  
- No duplicate Lucky ID per batch; no pending critical subscription requests.  
- Uses `transaction.atomic`, freezes `DrawEligibilitySnapshot` rows, sets `LOCKED` and `locked_at`.

Direct PATCH / `transition-status` to `LOCKED`, `DRAW_COMMITTED`, or `DRAW_COMPLETED` is **rejected**; use coordination endpoints.

### After eligibility is frozen

For batches in frozen statuses (including `LOCKED`, `DRAW_COMMITTED`, `DRAW_COMPLETED`, `DRAW_IN_PROGRESS`, `COMPLETED`, `CLOSED`, `CANCELLED`):

- No new EMI subscription on that batch while not `OPEN` (existing rule).  
- Admin cannot change customer, batch assignment, or Lucky ID on EMI subscriptions (`SubscriptionAdminSerializer`).  
- Lucky ID status changes are blocked (`LuckyIdAdminSerializer`).  

## Eligibility snapshot

`DrawEligibilitySnapshot` rows are **immutable** after insert (no update API). Each row stores subscription, customer, lucky id, product, partner, contract reference, EMI schedule summary (JSON-safe strings), `row_hash`, `sort_order`, and `snapshot_version`.

`freeze_draw_eligibility_snapshot`:

- If batch already `LOCKED` with snapshots → returns aggregate hash and counts (idempotent).  
- Otherwise creates the next `snapshot_version` from **currently eligible** EMI active subscriptions with assigned Lucky IDs.

Winner selection in `lucky_draw_service._eligible_winner_subscriptions` uses **only** the latest snapshot ordering when snapshots exist (not live eligibility filtering).

## Draw commit

`POST /api/v1/admin/batches/{id}/commit-draw/` → `commit_batch_draw`:

- Requires `LOCKED` and at least one snapshot version.  
- Builds `snapshot_hash` from ordered `row_hash` values.  
- Creates `DrawCommit` (one-to-one batch) and month-1 `LuckyDraw` with `draw_commit` FK; sets batch to `DRAW_COMMITTED`.  
- Returns `public_commit_hash` and **one-time** `admin_seed_store_securely` (store securely; required to execute).  
- Idempotent if commit already exists.  
- **Note:** Finance waiver account readiness is **not** enforced at commit; it is enforced at execute/reveal.

## Draw execute (idempotent)

`POST /api/v1/admin/batches/{id}/execute-draw/` with body `revealed_seed` (or `seed`) → `execute_batch_draw` → `reveal_and_execute_draw`:

- Requires `DRAW_COMMITTED` (unless draw already revealed) and waiver system accounts (`assert_waiver_finance_ready`).  
- Verifies seed against `committed_hash`.  
- Selects winner deterministically from **snapshot-ordered** subscriptions.  
- Second call returns the same winner payload; waivers and waiver ledger entries are **not** duplicated (`apply_winner_state` early-exits when draw already revealed for that subscription).  
- On success, batch moves to `DRAW_COMPLETED`; `post_winner_operational_followup` runs (delivery + best-effort stock reserve).

### Legacy draw commit

`POST …/create-commit/` (`create_lucky_draw_commit`) is **blocked** once batch is `LOCKED`, `DRAW_COMMITTED`, or `DRAW_COMPLETED` — use coordinated endpoints instead.

## Winner waiver

- Only **future** EMI rows still `PENDING` at winner month are waived; paid EMIs are unchanged.  
- Ledger: existing `EMI_WAIVER` posting and `AuditLog` patterns (`winner_state_service`) — no change to EMI amount math or payment posting rules.  
- If waiver accounts are missing, execute fails before completion.

## Delivery and inventory

After draw completion, `post_winner_operational_followup`:

- Creates a subscription delivery record when possible (pending staff action — not auto-delivered).  
- Best-effort `reserve_stock_for_subscription` when inventory exists.  

Admin control-center exposes `product_demand_status` / `delivery_status` as `not_configured` when no richer demand service is wired.

## Partner commission

Draw execution does **not** create commissions. Partner commission remains **payment-driven**; tests assert commission row counts unchanged across the draw.

### Partner UI visibility (Pass 9)

- Partner dashboard/commission/payout views can display winner status for partner-linked subscriptions **only when already available** in partner-permitted APIs.
- Winner status visibility does not alter commission computation, posting, approval, or payout batching.
- Partner pages remain visibility and workflow-routing surfaces; admin-only payout/reconciliation controls are not exposed.

## Public verification

Public winner payloads include `batch_name` (batch code), `draw_date` / `revealed_at`, `public_commit_hash`, `winner_lucky_number`, `verification_status` (`coordinated` vs `legacy`), and masked winner name only.

## Customer profile

`build_customer_profile_summary` adds `lucky_plan_draw`: per-subscription safe fields (`public_commit_hash`, draw dates, waived counts) for the logged-in customer only.

## Rollback and operations

- Do not delete or edit snapshot rows in production; migrations and DBA overrides only.  
- `DrawCommit` and revealed `LuckyDraw` are authoritative for audit; rotating seeds after commit invalidates reveal.  
- If execute fails after partial steps, treat as an incident: inspect batch status, `LuckyDraw.is_revealed`, and ledger; do not “fake” completion states.

See also: `docs/operations/batch-lock-draw-manual-test-checklist.md`.
