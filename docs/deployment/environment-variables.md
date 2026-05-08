# Environment Variables (Pre-Production + Production)

Store live values outside git (vault, secret manager, or server environment files).

## Backend Core
- `DJANGO_ENV=production`
- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY=<secure-random>`
- `DJANGO_ALLOWED_HOSTS=app.example.com,api.example.com`
- `JWT_SIGNING_KEY=<secure-random>`
- Database strategy:
  - `DATABASE_URL=postgresql://...`
  - or `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`

## Backend Security / Session / CORS
- `CORS_ALLOWED_ORIGINS=https://app.example.com`
- `CSRF_TRUSTED_ORIGINS=https://app.example.com`
- `SESSION_COOKIE_SECURE=true`
- `CSRF_COOKIE_SECURE=true`
- `SESSION_COOKIE_SAMESITE=Lax`
- `CSRF_COOKIE_SAMESITE=Lax`
- `SECURE_SSL_REDIRECT=true`
- `TRUST_X_FORWARDED_PROTO=true`
- `USE_X_FORWARDED_HOST=true`

## Static / Media / File Storage
- `STATIC_URL=/static/`
- `STATIC_ROOT=/srv/subidha-core/staticfiles`
- `MEDIA_URL=/media/`
- `MEDIA_ROOT=/srv/subidha-core/media`

## Logging / Monitoring / Backups
- `DJANGO_LOG_LEVEL=INFO`
- `BACKUP_ROOT=/var/backups/subidha`
- `HEALTHCHECK_DB_ALIAS=default`

## Email / SMS / OTP (if enabled)
- `EMAIL_BACKEND`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `DEFAULT_FROM_EMAIL`
- `OTP_DELIVERY_BACKEND`
- `OTP_ALLOW_EMAIL_FALLBACK`

## Payment Gateway (if enabled)
- `PAYMENT_GATEWAY_PROVIDER`
- `PAYMENT_GATEWAY_PUBLIC_KEY`
- `PAYMENT_GATEWAY_SECRET_KEY`
- `PAYMENT_GATEWAY_WEBHOOK_SECRET`

## Frontend Required
- `NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1`
- `NEXT_PUBLIC_SITE_URL=https://app.example.com`

## Critical Warning
- `NEXT_PUBLIC_API_BASE_URL` **must include `/api/v1`**.
- Correct: `https://api.example.com/api/v1`
- Incorrect: `https://api.example.com`

## Security Rules
- Never commit real secrets in `.env` files.
- Never commit Playwright auth storage states with tokens.
- Never expose backend-only secrets under `NEXT_PUBLIC_*`.
