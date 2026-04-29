# AI Phase 8 Readiness Checklist

Date: 2026-04-29

Scope: internal read-only assistant for admin users. AI must not automate financial operations or mutate SUBIDHA CORE business data.

## Required Flags

Default production posture:

```env
AI_ASSISTANT_ENABLED=false
AI_EMBEDDINGS_ENABLED=false
AI_VECTOR_SEARCH_ENABLED=false
```

Only enable AI after this checklist is complete.

## Access Rules

- [ ] All AI routes require JWT authentication.
- [ ] AI routes are admin-only.
- [ ] Non-admin users receive forbidden responses.
- [ ] Admin users receive a controlled disabled response when `AI_ASSISTANT_ENABLED=false`.
- [ ] Frontend disabled state is visible on assistant and BI explanation surfaces.

## Read-Only Safety

- [ ] AI query endpoint has no payment, waiver, draw, delivery, inventory, accounting, commission, payout, or reconciliation mutation path.
- [ ] BI explanation endpoint returns `safety.read_only=true`.
- [ ] BI explanation endpoint returns `safety.actions_executed=false`.
- [ ] AI feedback creates only feedback/audit rows, not business records.
- [ ] AI query log is audit/review data only.

## Grounding and Citations

- [ ] Approved source chunks are required for grounded answers.
- [ ] No-source queries return a low-confidence no-source response.
- [ ] Citations include source and chunk references.
- [ ] Retrieval is permission-filtered to admin-only approved sources.
- [ ] Keyword fallback is acceptable when embeddings are disabled.

## Source Ingestion Policy

Allowed source types:

- internal runbooks
- policy documents
- FAQ
- system help
- public page text

Blocked:

- `.env` files
- secrets, tokens, keys, credentials
- database backups/dumps
- customer exports
- KYC/customer/private contract material
- ledgers/payment ledger exports

Checks:

- [ ] Secret-like filenames are rejected.
- [ ] Secret-like content is rejected.
- [ ] Uploaded files are limited to `.txt` and `.md`.
- [ ] Sources must be `ADMIN_ONLY`.
- [ ] Failed ingestion is visible in readiness status.

## Readiness Endpoint

Endpoint:

- `GET /api/v1/admin/ai/readiness/`

Expected when enabled:

- feature flags
- knowledge base counts
- retrieval mode and vector availability
- safety flags
- last ingestion/query/feedback activity
- recommendations

Expected when disabled:

- admin UI handles the controlled disabled state
- non-admin users remain blocked

## Launch Decision

AI can remain disabled for launch. Enabling AI before launch is optional and must not be used to automate collections, reversals, waivers, lucky draws, reconciliation, accounting, inventory, rent, lease, or direct sale actions.

