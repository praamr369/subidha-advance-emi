# SUBIDHA CORE Production Deployment Handoff

This document is the production handoff for deploying SUBIDHA CORE safely after an RC has gone green.

## 1. Secret placement

Use a real secret manager or an ops-managed environment file outside version control.

- Backend secrets:
  Place in your process manager or an ops-owned env file such as `/etc/subidha-core/backend.env` with `chmod 600`.
- Frontend runtime config:
  Place public frontend variables in `frontend/.env.production` or inject them through the frontend process manager.
- Never commit:
  `backend/.env`, `frontend/.env.production`, database passwords, `DJANGO_SECRET_KEY`, or `JWT_SIGNING_KEY`.
- Never expose in frontend env:
  Backend-only secrets must not use `NEXT_PUBLIC_*`.

## 2. Required backend environment variables

Set these for every production deployment:

- `DJANGO_ENV=production`
- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY`
  Must be a random secret with at least 50 characters.
- `DJANGO_ALLOWED_HOSTS`
  Comma-separated bare hosts only, for example `api.subidha.example,admin.subidha.example`.
- Database configuration using one of:
  `DATABASE_URL`
  or
  `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`

Set these for browser traffic from the production frontend:

- `CORS_ALLOWED_ORIGINS`
  Full origins only, for example `https://app.subidha.example`
- `CSRF_TRUSTED_ORIGINS`
  Full origins only, for example `https://app.subidha.example`

Recommended backend security variables:

- `JWT_SIGNING_KEY`
  Optional but recommended. Use a separate random secret with at least 32 characters for JWT HMAC signing.
- `TRUST_X_FORWARDED_PROTO=true`
- `USE_X_FORWARDED_HOST=true`
- `SECURE_SSL_REDIRECT=true`
- `SESSION_COOKIE_SECURE=true`
- `CSRF_COOKIE_SECURE=true`
- `SESSION_COOKIE_SAMESITE=Lax`
- `CSRF_COOKIE_SAMESITE=Lax`
- `DJANGO_LOG_LEVEL=INFO`
- `DB_CONN_MAX_AGE=60`
- `STATIC_ROOT=/srv/subidha-core/staticfiles`
- `MEDIA_ROOT=/srv/subidha-core/media`

Operationally recommended when email/OTP flows are enabled:

- `OTP_DELIVERY_BACKEND`
- `OTP_ALLOW_EMAIL_FALLBACK`
- `EMAIL_BACKEND`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_USE_TLS`
- `EMAIL_USE_SSL`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `DEFAULT_FROM_EMAIL`

## 3. Required frontend environment variables

Set these for the Next.js deployment:

- `NEXT_PUBLIC_API_BASE_URL`
  Example: `https://api.subidha.example/api/v1`

Optional:

- `NEXT_PUBLIC_APP_NAME`

## 4. Backend deployment commands

Run from the repository root or from `backend/` with the same environment loaded:

```bash
cd backend
.venv/bin/python manage.py check --deploy --settings core.settings.production
.venv/bin/python manage.py migrate --settings core.settings.production
.venv/bin/python manage.py collectstatic --noinput --settings core.settings.production
```

Example production startup command:

```bash
cd backend
.venv/bin/gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120
```

## 5. Frontend build and startup commands

Run from `frontend/` with `NEXT_PUBLIC_API_BASE_URL` already set:

```bash
cd frontend
npm ci
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

## 6. Database migration commands

Apply migrations before sending live traffic:

```bash
cd backend
.venv/bin/python manage.py migrate --settings core.settings.production
```

If you need a dry validation first:

```bash
cd backend
.venv/bin/python manage.py showmigrations --settings core.settings.production
```

## 7. Post-deploy smoke validation commands

Health and readiness:

```bash
curl -fsS https://api.subidha.example/healthz/
curl -fsS https://api.subidha.example/readyz/
curl -fsS https://api.subidha.example/api/v1/public/health/
curl -fsS https://api.subidha.example/api/v1/public/readiness/
curl -I https://app.subidha.example/login
```

Repository-local validation before promoting a candidate:

```bash
bash backend/scripts/validate-release-candidate.sh
bash frontend/scripts/validate-release-candidate.sh
bash scripts/run-release-candidate.sh
```

Do not run the full RC script against a live production database. Use it in release-candidate or staging environments that mirror production configuration.

## 8. Release gate

Do not mark the deployment complete until all of the following are true:

- production secrets are loaded from an external secret source
- `check --deploy` passes
- migrations are applied
- static assets are collected
- backend readiness is green
- frontend login page responds
- admin login is verified
- one customer, partner, and cashier read-only route check completes successfully
