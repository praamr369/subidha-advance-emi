# Manual checklist — batch lock and Lucky Plan draw

Use in staging before production manual testing. Requires admin API access.

## Preconditions

- Accounting phase-3 system accounts provisioned (waiver / receivable paths used by `ensure_phase3_system_accounts`).  
- Batch at `OPEN` → fill to `FULL` with all Lucky IDs assigned.  
- No pending submitted subscription requests on the batch.

## 1) Lock batch

- [ ] `POST /api/v1/admin/batches/{id}/lock/` returns 200 with `snapshot_version`, `snapshot_hash`, `eligible_count`, `lock_timestamp`.  
- [ ] Batch status is `LOCKED`; `locked_at` set.  
- [ ] `GET /api/v1/admin/batches/{id}/control-center/` shows `snapshot_status` present, `disabled_reasons.lock_batch` understandable when blocked.  
- [ ] Attempt new EMI subscription on batch → 400 / validation (batch not open).  
- [ ] Attempt admin PATCH subscription customer or Lucky ID → blocked when frozen.

## 2) Commit draw

- [ ] `POST /api/v1/admin/batches/{id}/commit-draw/` returns `public_commit_hash`, `lucky_draw_id`, and `admin_seed_store_securely` once.  
- [ ] Batch status `DRAW_COMMITTED`.  
- [ ] Second commit returns idempotent metadata without new seed.  
- [ ] Legacy `POST …/create-commit/` rejected for coordinated batch.

## 3) Execute draw

- [ ] `POST /api/v1/admin/batches/{id}/execute-draw/` with `revealed_seed` returns winner Lucky/subscription identifiers.  
- [ ] Batch becomes `DRAW_COMPLETED`.  
- [ ] Repeat execute with same seed → same winner; no extra waiver ledger lines for the same draw id.  
- [ ] EMIs before winner month that were **paid** stay paid; future pending EMIs waived.

## 4) Finance

- [ ] With accounts deliberately missing in a throwaway env, execute returns clear 400 and batch does not reach spurious `DRAW_COMPLETED`.  
- [ ] Waiver ledger entries reference draw id in allocation context.

## 5) Delivery / inventory

- [ ] Winner has delivery row in pending state (not auto-delivered).  
- [ ] If inventory module enabled, optional reservation appears; otherwise control-center notes limitations.

## 6) Public / customer

- [ ] `GET /api/v1/public/latest-winner/` (or winner history) shows `public_commit_hash`, `verification_status`, no full customer PII.  
- [ ] Customer profile summary includes `lucky_plan_draw` only for own subscriptions.

## 7) Partner

- [ ] Partner commission totals unchanged by draw (payments still drive commission).

## Rollback warning

Removing or editing snapshots/commits after lock breaks verifiability. Escalate to engineering; do not hand-edit winner or EMI in production without audit procedures.
