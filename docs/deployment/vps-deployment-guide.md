# VPS Deployment Guide (Backend + Frontend + Nginx)

Date: 2026-04-29

This guide is for production VPS deployment of SUBIDHA CORE. It assumes the approved stack remains Django/DRF, PostgreSQL, JWT auth, Next.js App Router, Tailwind, and shadcn/ui.

## 1) Server Prerequisites

- Ubuntu LTS VPS
- PostgreSQL 14+ or managed PostgreSQL
- Python 3.12+
- Node 20+ and npm
- Nginx
- Certbot
- systemd
- A writable backup volume or external backup target

## 2) Directory Layout

- App root: `/srv/subidha-core`
- Backend: `/srv/subidha-core/backend`
- Frontend: `/srv/subidha-core/frontend`
- Backend env file: `/etc/subidha-core/backend.env`
- Frontend env file: `/etc/subidha-core/frontend.env`
- Static root: `/srv/subidha-core/staticfiles`
- Media root: `/srv/subidha-core/media`
- Backup root: `/var/backups/subidha`

```bash
sudo mkdir -p /srv/subidha-core /etc/subidha-core /srv/subidha-core/staticfiles /srv/subidha-core/media /var/backups/subidha
sudo chown -R www-data:www-data /srv/subidha-core/staticfiles /srv/subidha-core/media
```

## 3) Required Backend Env

Use `backend/.env.production.template` as the source checklist, but put real values only in `/etc/subidha-core/backend.env`.

Required:

- `DJANGO_ENV=production`
- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY`
- `JWT_SIGNING_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `DATABASE_URL` or explicit `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `STATIC_ROOT=/srv/subidha-core/staticfiles`
- `MEDIA_ROOT=/srv/subidha-core/media`
- `TRUST_X_FORWARDED_PROTO=true`
- `SECURE_SSL_REDIRECT=true`
- `SESSION_COOKIE_SECURE=true`
- `CSRF_COOKIE_SECURE=true`

AI default for launch:

```env
AI_ASSISTANT_ENABLED=false
AI_EMBEDDINGS_ENABLED=false
AI_VECTOR_SEARCH_ENABLED=false
```

## 4) Required Frontend Env

Use `frontend/.env.production.template` as the source checklist, but put real values only in `/etc/subidha-core/frontend.env`.

Required:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
NEXT_PUBLIC_APP_NAME=SUBIDHA CORE
NODE_ENV=production
```

Never put backend-only secrets in `NEXT_PUBLIC_*`.

## 5) Backend Deployment Commands

```bash
cd /srv/subidha-core/backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
set -a
. /etc/subidha-core/backend.env
set +a
python manage.py check --deploy --settings core.settings.production
python manage.py migrate --settings core.settings.production
python manage.py collectstatic --noinput --settings core.settings.production
```

Gunicorn command:

```bash
cd /srv/subidha-core/backend
. .venv/bin/activate
set -a
. /etc/subidha-core/backend.env
set +a
gunicorn core.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120
```

## 6) Frontend Deployment Commands

```bash
cd /srv/subidha-core/frontend
set -a
. /etc/subidha-core/frontend.env
set +a
npm ci
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

## 7) systemd Template (Backend)

Create `/etc/systemd/system/subidha-backend.service`:

```ini
[Unit]
Description=SUBIDHA CORE Django Backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/srv/subidha-core/backend
EnvironmentFile=/etc/subidha-core/backend.env
ExecStart=/srv/subidha-core/backend/.venv/bin/gunicorn core.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 8) systemd Template (Frontend)

Create `/etc/systemd/system/subidha-frontend.service`:

```ini
[Unit]
Description=SUBIDHA CORE Next.js Frontend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/srv/subidha-core/frontend
EnvironmentFile=/etc/subidha-core/frontend.env
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now subidha-backend
sudo systemctl enable --now subidha-frontend
```

## 9) Nginx Reverse Proxy Template

Create `/etc/nginx/sites-available/subidha-core`:

```nginx
server {
    listen 80;
    server_name app.example.com api.example.com;
    client_max_body_size 25m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /healthz/ { proxy_pass http://127.0.0.1:8000/healthz/; }
    location /readyz/  { proxy_pass http://127.0.0.1:8000/readyz/; }

    location /static/ {
        alias /srv/subidha-core/staticfiles/;
        access_log off;
        expires 30d;
    }

    location /media/ {
        alias /srv/subidha-core/media/;
        add_header X-Content-Type-Options nosniff;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable + validate:

```bash
sudo ln -s /etc/nginx/sites-available/subidha-core /etc/nginx/sites-enabled/subidha-core
sudo nginx -t
sudo systemctl reload nginx
```

## 10) SSL (Certbot)

```bash
sudo certbot --nginx -d app.example.com -d api.example.com
sudo certbot renew --dry-run
```

## 11) Backup Cron Example

Create `/usr/local/bin/subidha-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

set -a
. /etc/subidha-core/backend.env
set +a

mkdir -p /var/backups/subidha/db /var/backups/subidha/media
pg_dump --format=custom --file="/var/backups/subidha/db/db-$(date +%F).dump" "$DATABASE_URL"
rsync -a --delete /srv/subidha-core/media/ /var/backups/subidha/media/
find /var/backups/subidha/db -name 'db-*.dump' -mtime +30 -delete
```

Install:

```bash
sudo chmod 750 /usr/local/bin/subidha-backup.sh
```

```cron
0 2 * * * /usr/local/bin/subidha-backup.sh >> /var/log/subidha-backup.log 2>&1
```

## 12) Restore Procedure

Always restore into staging/test first.

```bash
set -a
. /etc/subidha-core/backend.env
set +a
export STAGING_DATABASE_URL="postgresql://subidha_staging:password@127.0.0.1:5432/subidha_staging"

pg_restore --clean --if-exists --no-owner --dbname="$STAGING_DATABASE_URL" /var/backups/subidha/db/db-YYYY-MM-DD.dump
rsync -a /var/backups/subidha/media/ /srv/subidha-core/media/
```

Then reconcile app state:

```bash
cd /srv/subidha-core/backend
. .venv/bin/activate
export DATABASE_URL="$STAGING_DATABASE_URL"
python manage.py migrate --settings core.settings.production
python manage.py collectstatic --noinput --settings core.settings.production
```

Then verify:

- `/healthz/` returns 200
- `/readyz/` returns 200
- admin login works
- customer/partner scoped access still works
- one recent receipt/invoice/delivery PDF renders

## 13) Health Checks

Public endpoints:

- `GET /healthz/`
- `GET /readyz/`

Expected:

- liveness returns status `ok`
- readiness returns status `ready`
- readiness checks database connectivity
- readiness checks pending migrations when enabled

## 14) Go-Live Reset

Only use reset after a backup and only from the preserved admin account.

Preview:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://api.example.com/api/v1/admin/business-setup/reset-preview/?preserve_username=subidhafurniture"
```

Execution body must use a JSON boolean:

```json
{
  "confirm": true,
  "preserve_username": "subidhafurniture",
  "delete_non_preserved_users": true,
  "clear_auth_artifacts": true,
  "dry_run": false
}
```

Post-reset:

- confirm only the preserved admin can log in
- complete `/admin/settings/business-setup/checklist`
- do not open live collections until required checklist items pass

## 15) Final Validation

Run before production cutover:

```bash
cd /srv/subidha-core
bash scripts/run-release-candidate.sh
```

If the release script is not available on the host, run the equivalent backend and frontend commands from `docs/operations/go-live-dry-run.md`.
