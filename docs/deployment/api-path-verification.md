# API Path Verification (Deployment)

This document helps you verify SUBIDHA CORE's canonical API prefix and quickly diagnose 404s caused by base-path or reverse-proxy mismatches.

## Canonical backend API prefix

The Django backend serves v1 APIs under:

- `/api/v1/…`

Code sources:

- `backend/core/urls.py` includes `path("api/v1/", include("api.v1.urls"))`
- `backend/api/v1/urls.py` registers sub-routers like `admin/`, `auth/`, `partner/`, `customer/`, etc.

Example admin report endpoint:

- `/api/v1/admin/reports/emi-aggregate/`

## Frontend configuration expectations

Primary runtime variable:

- `NEXT_PUBLIC_API_BASE_URL`

Recommended canonical value:

- `https://<backend-origin>/api/v1`

To reduce deployment fragility, the frontend normalizes these common misconfigurations:

- `https://<backend-origin>` -> becomes `https://<backend-origin>/api/v1`
- `https://<app-origin>/api` -> becomes `https://<app-origin>/api/v1`
- `https://<backend-origin>/api/v1/` -> becomes `https://<backend-origin>/api/v1`

If you use a relative value like `/api/v1`, the frontend will target the same origin (useful when a reverse proxy routes `/api/` to the backend).

## Quick curl checks (from your laptop or server)

Replace `<ORIGIN>` with the exact origin your clients hit (scheme + host + optional port).

Backend liveness/readiness (direct):

```bash
curl -fsS <ORIGIN>/healthz/
curl -fsS <ORIGIN>/readyz/
```

API alias endpoints:

```bash
curl -fsS <ORIGIN>/api/v1/public/health/
curl -fsS <ORIGIN>/api/v1/public/readiness/
```

Admin reports (requires auth; this only checks routing shape):

```bash
curl -I <ORIGIN>/api/v1/admin/reports/emi-aggregate/
curl -I <ORIGIN>/api/v1/admin/reports/emi-summary/
```

Expected:

- `401/403` is OK without auth (means route exists)
- `404` indicates a base-path/proxy mismatch or the wrong backend build

## Common 404 causes and where to look

### 1) Old backend build still running

Symptoms:

- routes exist in git but return 404 in the environment

Checks:

- confirm the deployed container/venv corresponds to the intended git SHA/tag
- restart the backend process after deploy (gunicorn/uvicorn/systemd/etc.)

### 2) Frontend points to the wrong base URL

Symptoms:

- browser requests go to `https://<origin>/admin/...` (missing `/api/v1`)
- or go to the wrong domain entirely

Checks:

- inspect deployed `NEXT_PUBLIC_API_BASE_URL` used at build/runtime for Next.js
- open DevTools -> Network -> confirm requests are hitting `/api/v1/...`

### 3) Reverse proxy strips `/api/v1` before reaching Django

This is the most common Nginx misconfiguration.

Bad example (strips the prefix):

```nginx
location /api/v1/ {
  proxy_pass http://backend:8000/;
}
```

In that case, a client request to `/api/v1/admin/...` becomes `/admin/...` at Django and returns 404.

Safer patterns:

- preserve URI:

```nginx
location /api/ {
  proxy_pass http://backend:8000;
}
```

- or explicitly rewrite (only if you really mean it), but then Django must serve at `/` (SUBIDHA CORE does not):

```nginx
location /api/v1/ {
  proxy_pass http://backend:8000/api/v1/;
}
```

Checks on the server:

- locate the active Nginx site config (often under `/etc/nginx/sites-enabled/` or `/etc/nginx/conf.d/`)
- verify the `location` blocks and `proxy_pass` URI behavior for `/api/` and `/api/v1/`
- reload Nginx after changes: `nginx -t && systemctl reload nginx` (or your process manager)

### 4) Different domains with CORS/CSRF settings

Symptoms:

- not 404, but requests fail in browser (CORS or CSRF)

Checks:

- backend env vars: `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`
- confirm they match the exact frontend origin

