# Final Pre-Main Release Checklist (Updates Branch)

## Branch and scope freeze
- [ ] Confirm current branch is `updates`.
- [ ] Confirm `main` is untouched in this RC pass.
- [ ] Confirm no non-intentional artifacts are staged (`node_modules`, `.next`, `test-results`, local env files, sqlite/db files, screenshots, logs).

## Mandatory validation commands
- [ ] `cd backend && ../.venv/bin/python manage.py makemigrations --check --dry-run`
- [ ] `cd backend && ../.venv/bin/python manage.py check`
- [ ] `cd backend && ../.venv/bin/python manage.py test tests.api`
- [ ] `cd backend && ../.venv/bin/python manage.py test`
- [ ] `cd frontend && npm run lint`
- [ ] `cd frontend && npm run typecheck`
- [ ] `cd frontend && npm run build`
- [ ] `bash scripts/run-release-candidate.sh`

## Migration and seed readiness
- [ ] Apply migrations in production:
  - `cd backend && ../.venv/bin/python manage.py migrate`
- [ ] Seed policy templates (idempotent):
  - `cd backend && ../.venv/bin/python manage.py seed_policy_pages`
- [ ] If backend static assets are served by Django:
  - `cd backend && ../.venv/bin/python manage.py collectstatic --noinput`

## Environment and deployment prerequisites
- [ ] Verify production env values are present (backend + frontend).
- [ ] Verify OTP/email/finance mapping readiness expectations are explicitly reviewed.
- [ ] Verify banner assets under `frontend/public/brand/banners/` are complete or fallback behavior is accepted.

## Rollback reminder
- [ ] Rollback plan reviewed before merge/deploy (`docs/deployment/rollback-plan.md` and `docs/deployment/rollback-incident-handling.md`).

## Post-deployment smoke
- [ ] Public routes load: `/`, `/products`, `/lucky-plan`, `/winners`, `/winner-history`, policy pages.
- [ ] Role dashboards load without auth regression: admin, cashier, customer, partner.
- [ ] Payment collection, receipt view, policy public/admin access, and health endpoints pass smoke checks.
