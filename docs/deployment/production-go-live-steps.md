# Production Go-Live Steps (Post-RC)

## 1) Pre-deploy gate
1. Confirm final RC passed on `updates`:
   - `bash scripts/run-release-candidate.sh`
2. Confirm `main` is still untouched during freeze.

## 2) Backend deploy
1. Deploy backend artifact/revision.
2. Run migrations:
   - `cd backend && ../.venv/bin/python manage.py migrate`
3. Seed policy pages (safe to rerun):
   - `cd backend && ../.venv/bin/python manage.py seed_policy_pages`
4. Collect static files when Django serves static assets:
   - `cd backend && ../.venv/bin/python manage.py collectstatic --noinput`

## 3) Frontend deploy
1. Build frontend:
   - `cd frontend && npm run build`
2. Deploy frontend build with production env vars configured.

## 4) Environment reminders
1. Confirm required backend env vars (DB, JWT, CORS, email/OTP, finance/account mapping dependencies).
2. Confirm required frontend env vars (API base URL and public runtime vars).
3. Validate `DEBUG=False` in production.

## 5) Post-deployment smoke checklist
1. Health checks:
   - `/healthz/`
   - `/readyz/`
   - `/api/v1/public/health/`
2. Public pages:
   - Home/products/lucky-plan/winners/winner-history/policy routes.
3. Auth and role dashboards:
   - Admin, cashier, customer, partner login and landing routes.
4. Policy governance:
   - Draft policies are not public.
   - Published policies are public.
   - Admin policy management is accessible only to admin.

## 6) Rollback reminder
1. If critical regression is detected, execute rollback per:
   - `docs/deployment/rollback-plan.md`
   - `docs/deployment/rollback-incident-handling.md`
