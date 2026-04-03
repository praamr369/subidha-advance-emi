# SUBIDHA ADVANCE EMI – Deployment and Recovery Runbook

This runbook is for deploying, verifying, backing up, restoring, and recovering the Django backend safely in real operations.

## 1. Environment setup

From the repository root:

```bash
cd backend
cp .env.example .env
```

Set at minimum:

- `DJANGO_ENV`
- `DJANGO_DEBUG`
- `DJANGO_SECRET_KEY`
- `JWT_SIGNING_KEY` (recommended separate JWT HMAC secret; minimum 32 characters)
- `DJANGO_ALLOWED_HOSTS`
- database settings via either `DATABASE_URL` or `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT`

For browser-based frontend traffic, also set:

- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`

For reverse-proxy HTTPS deployments, set as needed:

- `TRUST_X_FORWARDED_PROTO=true`
- `USE_X_FORWARDED_HOST=true`
- `SECURE_SSL_REDIRECT=true`
- `SESSION_COOKIE_SECURE=true`
- `CSRF_COOKIE_SECURE=true`

Optional operational health settings:

- `HEALTHCHECK_DB_ALIAS=default`
- `HEALTHCHECK_CHECK_MIGRATIONS=true`
- `HEALTHCHECK_INCLUDE_DETAILS=false`

## 2. Startup and deployment sequence

Run these from `backend/`:

```bash
python manage.py check --deploy
python manage.py migrate
python manage.py collectstatic --noinput
```

Then start the app using your process manager. Example WSGI command:

```bash
gunicorn core.wsgi:application --bind 0.0.0.0:8000
```

## 3. Health and readiness verification

Operational endpoints:

- `GET /healthz/` → liveness only
- `GET /readyz/` → readiness with DB and migration checks
- `GET /api/v1/public/health/` → API alias for liveness
- `GET /api/v1/public/readiness/` → API alias for readiness

Expected behavior:

- `healthz` should return HTTP 200 when the process is alive
- `readyz` should return HTTP 200 only when:
  - DB connection succeeds
  - `SELECT 1` succeeds
  - migrations are fully applied, if migration checking is enabled
- `readyz` returns HTTP 503 when the app is not ready for traffic

## 4. Create or recover an admin account

Because the custom user model requires `phone` and `role`, the safest recovery path is Django shell.

```bash
python manage.py shell
```

```python
from django.contrib.auth import get_user_model

User = get_user_model()
user, created = User.objects.get_or_create(username="admin")
user.phone = "9000000000"
user.role = "ADMIN"
user.is_staff = True
user.is_superuser = True
user.is_active = True
user.set_password("change-me-now")
user.save()
print({"id": user.id, "created": created})
```

After recovery:

- log in immediately
- rotate the temporary password
- record who performed the recovery and why

## 5. Backup expectations

Minimum expectations before any production release:

- take a PostgreSQL backup using `pg_dump` or your managed DB snapshot tool
- back up uploaded media files if file uploads are in use
- keep environment secrets backed up outside the repo
- take a fresh backup before schema-affecting releases, even when migrations are additive

Example PostgreSQL backup:

```bash
pg_dump --format=custom --file=subidha-backup.dump "$DATABASE_URL"
```

## 6. Restore expectations

Restore order:

1. provision target environment and env vars
2. restore PostgreSQL dump
3. restore media files if applicable
4. run:

```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

5. verify:
   - `/healthz/`
   - `/readyz/`
6. recover or verify admin access if needed
7. run the release smoke checks in `docs/deployment/RELEASE_SMOKE_CHECKLIST.md`

Example PostgreSQL restore:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" subidha-backup.dump
```

## 7. Failure interpretation

Common operational failure meanings:

- `DJANGO_SECRET_KEY` missing → startup should fail immediately outside local development
- weak `DJANGO_SECRET_KEY` or `JWT_SIGNING_KEY` → startup should fail immediately outside local development
- `DJANGO_ALLOWED_HOSTS` missing → startup should fail immediately outside local development
- DB env missing → startup should fail immediately outside local development
- `readyz` returns 503 with database failure → app is up, DB path is not healthy
- `readyz` returns 503 with pending migrations → deploy is incomplete; do not send traffic yet

## 8. Release discipline

Before marking a deployment successful:

- backup completed
- `check --deploy` completed
- migrations completed
- static files collected
- `readyz` is green
- smoke checklist completed
- admin login verified
