# Final Deploy Checklist

Date: 2026-04-29

Use this after Phase 9F validation passes. Do not deploy if any item marked required is incomplete.

## Required Backend Environment

- [ ] `DJANGO_ENV=production`
- [ ] `DJANGO_DEBUG=false`
- [ ] `DJANGO_SECRET_KEY` is unique, non-placeholder, and at least 50 characters.
- [ ] `JWT_SIGNING_KEY` is unique, non-placeholder, and at least 32 characters.
- [ ] `DJANGO_ALLOWED_HOSTS` contains only bare hosts.
- [ ] `CORS_ALLOWED_ORIGINS` contains the production frontend origin.
- [ ] `CSRF_TRUSTED_ORIGINS` contains the production frontend origin.
- [ ] `DATABASE_URL` points to PostgreSQL, or explicit `DB_*` variables are complete.
- [ ] `STATIC_ROOT` points to the deployed staticfiles directory.
- [ ] `MEDIA_ROOT` points to the deployed media directory.
- [ ] `TRUST_X_FORWARDED_PROTO=true` behind HTTPS reverse proxy.
- [ ] `SECURE_SSL_REDIRECT=true`.
- [ ] `SESSION_COOKIE_SECURE=true`.
- [ ] `CSRF_COOKIE_SECURE=true`.

## Required Frontend Environment

- [ ] `NEXT_PUBLIC_API_BASE_URL` points to the backend API root and normalizes to `/api/v1`.
- [ ] `NEXT_PUBLIC_APP_NAME=SUBIDHA CORE`.
- [ ] No backend secrets are exposed as `NEXT_PUBLIC_*`.

## AI Flags

- [ ] `AI_ASSISTANT_ENABLED=false` unless the admin-only readiness checklist is signed off.
- [ ] `AI_EMBEDDINGS_ENABLED=false` unless embedding provider and source policy are signed off.
- [ ] `AI_VECTOR_SEARCH_ENABLED=false` unless embeddings are enabled and verified.
- [ ] AI source ingestion has no customer/private contract exports.
- [ ] AI has no financial action permissions.

## BI Control Center

- [ ] `/admin/bi` loads for admin.
- [ ] Non-admin users cannot access BI API.
- [ ] BI cards use real payloads or empty states.
- [ ] BI links are report/navigation links only.
- [ ] No BI route executes financial mutation.

## Reset and Setup

- [ ] Reset preview reviewed and archived outside git.
- [ ] Reset execution tested in staging with JSON boolean `confirm=true`.
- [ ] Exactly one intended admin survives reset.
- [ ] Business setup checklist blocks live collections until required items are complete.
- [ ] Branch, counter, finance account, COA, product, batch, and cashier setup are complete.

## Workflow Smoke

- [ ] Advance EMI contract creation, ContractReference, schedule, admin/cashier collection, receipt PDF.
- [ ] Lucky draw winner future EMI waiver only.
- [ ] Delivery/handover PDF.
- [ ] Direct sale invoice, ContractReference, partial/full collection, receipt/invoice PDF.
- [ ] Rent/lease contract, deposit, monthly demand visibility, return/refund/deduction PDFs.
- [ ] Rent/lease unified collection remains disabled.
- [ ] Unified collection search works for admin and cashier scopes.

## Backup and Restore

- [ ] Database backup command tested.
- [ ] Media backup command tested.
- [ ] Restore into staging/test DB tested.
- [ ] `/healthz/` and `/readyz/` pass after restore.
- [ ] Preserved admin login works after restore.
- [ ] Backup cron installed and monitored.

## Build and Validation

- [ ] `manage.py check` passes.
- [ ] `makemigrations --check --dry-run` passes.
- [ ] Backend tests pass.
- [ ] Frontend typecheck passes.
- [ ] Frontend lint passes.
- [ ] Frontend build passes.
- [ ] `scripts/run-release-candidate.sh` passes.

## Cutover

- [ ] Maintenance window approved.
- [ ] Pre-deploy database and media backups complete.
- [ ] Migrations applied.
- [ ] Static files collected.
- [ ] Backend and frontend services restarted.
- [ ] Nginx config validated and reloaded.
- [ ] HTTPS certificate active.
- [ ] Admin login verified.
- [ ] First business setup checklist verified after deploy.

