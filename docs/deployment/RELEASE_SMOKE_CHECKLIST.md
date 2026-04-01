# SUBIDHA ADVANCE EMI – Release Smoke Checklist

Run this after deployment, migration, and collectstatic are complete.

## 1. Process and routing

- `GET /healthz/` returns HTTP 200
- `GET /readyz/` returns HTTP 200
- `GET /api/v1/public/health/` returns HTTP 200
- `GET /api/v1/public/readiness/` returns HTTP 200

## 2. Public API checks

- `GET /api/v1/public/stats/` returns HTTP 200
- `GET /api/v1/public/products/` returns HTTP 200
- `GET /api/v1/public/latest-winner/` returns HTTP 200

## 3. Auth checks

Use a real admin test account.

- `POST /api/v1/auth/login/` returns access and refresh tokens
- `POST /api/v1/auth/refresh/` returns a fresh access token
- `GET /api/v1/auth/me/` succeeds with the access token

## 4. Admin operational checks

- admin can reach `/api/v1/admin/dashboard/`
- admin payments register loads
- admin subscriptions register loads
- public health and readiness remain green after admin login flow

## 5. Data integrity checks

- `readyz` does not report pending migrations
- latest known active subscriptions are visible
- payment list endpoints return data without 500 errors
- logs do not show startup or DB connectivity exceptions after the deploy

## 6. Recovery checkpoint

Before closing the release:

- confirm latest backup timestamp
- confirm where the restore artifact is stored
- confirm at least one admin recovery path is documented and tested
