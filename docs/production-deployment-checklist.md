# Production Deployment Checklist

## Pre-Deployment
- [ ] `python manage.py check_production_readiness` passes.
- [ ] Pending migrations reviewed and approved.
- [ ] `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, and CORS origins verified.
- [ ] Secure cookie settings enabled.
- [ ] Auth and payment throttling configured in `REST_FRAMEWORK.DEFAULT_THROTTLE_RATES`.
- [ ] Backup destination (`BACKUP_ROOT`) exists and is writable.

## Deployment
- [ ] Deploy backend and frontend artifacts.
- [ ] Apply migrations.
- [ ] Verify `/api/v1/health/` returns `ok`.
- [ ] Verify `/api/v1/health/deep/` returns `healthy`.

## Post-Deployment Verification
- [ ] Admin login succeeds.
- [ ] Payment collect and reverse endpoints enforce permissions.
- [ ] Draw commit and waiver workflows remain operational.
- [ ] Reports center loads and export permission gate works.
- [ ] Structured logs visible for security and finance events.

## Rollback Readiness
- [ ] Last known good release tag identified.
- [ ] Database rollback strategy confirmed.
- [ ] Incident lead assigned for release window.
