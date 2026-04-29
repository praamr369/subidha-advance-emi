# Known Limitations Before Launch

Date: 2026-04-29

These are not hidden defects. They are the current launch constraints that operators must understand before opening live use.

## Launch-Safe Limitations

### Rent/lease unified collection is disabled

Status: intentional.

Reason: rent/lease monthly collection must not be exposed through unified collection until a production-safe posting service exists. Search/view is available; payment action is disabled with a reason.

Launch impact: safe if staff are trained to use only supported rent/lease deposit and document workflows.

### AI assistant is disabled by default

Status: intentional.

Reason: AI is Phase 8 read-only/admin-only and should be enabled only after source ingestion and safety checks are signed off.

Launch impact: safe. BI explanation and assistant UI show disabled state.

### AI retrieval may run keyword-only

Status: acceptable.

Reason: embeddings/vector search are optional and disabled unless explicitly configured.

Launch impact: safe. Answers remain source-grounded or return a no-source response.

### Reserved-stock BI metric is unavailable

Status: acceptable.

Reason: BI Control Center does not fabricate reserved-stock metrics. Inventory reservation logic exists in stock services, but `/admin/bi` does not show a fake reserved-stock card.

Launch impact: safe. Use inventory reports/stock-on-hand screens for stock operations.

### SMS OTP backend may not be configured

Status: environment-dependent.

Reason: OTP delivery readiness depends on production SMS/email configuration. The SMS placeholder is documented and must be checked in the OTP readiness panel.

Launch impact: blocker only if customer password reset/OTP is required on day one.

### Large-volume performance dataset is not committed

Status: intentional.

Reason: Phase 9F prohibits large fake data in source code. Performance smoke must use staging-only generated data or a sanitized database copy.

Launch impact: safe if the staging performance run is completed and archived before production cutover.

## Launch Blockers If Found During Final Run

- Reset preview does not show planned deletion counts.
- Reset execution accepts a non-boolean `confirm`.
- Reset leaves more than one admin when the one-admin dry run is requested.
- Setup checklist reports ready with missing required masters.
- `/admin/bi` fails to load for admin.
- BI exposes mutation/action execution.
- AI is accessible to non-admin users.
- AI ingests secrets, customer exports, private contracts, or ledgers.
- Customer/partner/cashier role boundaries fail.
- PDF endpoints expose raw filesystem paths.
- JWT refresh/logout fails.
- Backup restore cannot produce green `/healthz/` and `/readyz/`.
- Production settings allow `DEBUG=true`, wildcard hosts, missing secrets, or missing PostgreSQL config.

