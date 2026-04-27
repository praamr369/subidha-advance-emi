# Environment Variables (Production Matrix)

All production secrets must be stored outside git (systemd env file, secret manager, or vault).

## Backend Required

- `DJANGO_ENV=production`
- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY` (>=50 chars, non-placeholder)
- `JWT_SIGNING_KEY` (>=32 chars, non-placeholder; separate from Django key recommended)
- `DJANGO_ALLOWED_HOSTS` (comma-separated bare hosts, no ports/paths)
- Database (choose one strategy):
  - `DATABASE_URL=postgresql://...`
  - OR `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`

## Backend Security and Proxy Recommended

- `CORS_ALLOWED_ORIGINS=https://app.example.com`
- `CSRF_TRUSTED_ORIGINS=https://app.example.com`
- `TRUST_X_FORWARDED_PROTO=true`
- `USE_X_FORWARDED_HOST=true`
- `SECURE_SSL_REDIRECT=true`
- `SESSION_COOKIE_SECURE=true`
- `CSRF_COOKIE_SECURE=true`
- `SESSION_COOKIE_SAMESITE=Lax`
- `CSRF_COOKIE_SAMESITE=Lax`
- `DJANGO_LOG_LEVEL=INFO`
- `DB_CONN_MAX_AGE=60`

## Static/Media

- `STATIC_URL=/static/`
- `STATIC_ROOT=/srv/subidha-core/staticfiles`
- `MEDIA_URL=/media/`
- `MEDIA_ROOT=/srv/subidha-core/media`

## Health/Readiness Controls

- `HEALTHCHECK_DB_ALIAS=default`
- `HEALTHCHECK_CHECK_MIGRATIONS=true`
- `HEALTHCHECK_INCLUDE_DETAILS=false`

## Email/OTP (required if password reset + OTP flows are active)

- `OTP_DELIVERY_BACKEND` (`auto`/`sms`/`email`)
- `OTP_ALLOW_EMAIL_FALLBACK=true|false`
- `EMAIL_BACKEND`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_USE_TLS`
- `EMAIL_USE_SSL`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `DEFAULT_FROM_EMAIL`

## Frontend Required

- `NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1`

## Frontend Optional

- `NEXT_PUBLIC_APP_NAME=SUBIDHA CORE`

## Secrets Handling Rules

- Never commit `.env` files with live credentials.
- Never expose backend-only secrets as `NEXT_PUBLIC_*`.
- Rotate secrets on handover cutover and after any incident.
