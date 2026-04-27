# VPS Deployment Guide (Backend + Frontend + Nginx)

## 1) Server Prerequisites

- Ubuntu LTS VPS
- PostgreSQL (managed or self-hosted)
- Python 3.12+, Node 20+, npm
- Nginx
- Certbot
- systemd

## 2) Directory Layout

- App root: `/srv/subidha-core`
- Backend env file: `/etc/subidha-core/backend.env`
- Frontend env file: `/etc/subidha-core/frontend.env`
- Static root: `/srv/subidha-core/staticfiles`
- Media root: `/srv/subidha-core/media`

## 3) Backend Deployment Commands

```bash
cd /srv/subidha-core/backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py check --deploy --settings core.settings.production
python manage.py migrate --settings core.settings.production
python manage.py collectstatic --noinput --settings core.settings.production
```

Backend start command:

```bash
cd /srv/subidha-core/backend
. .venv/bin/activate
gunicorn core.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120
```

## 4) Frontend Deployment Commands

```bash
cd /srv/subidha-core/frontend
npm ci
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

## 5) systemd Template (Backend)

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

## 6) systemd Template (Frontend)

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

## 7) Nginx Reverse Proxy Template

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

    location /static/ { alias /srv/subidha-core/staticfiles/; }
    location /media/  { alias /srv/subidha-core/media/; }

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

## 8) SSL (Certbot)

```bash
sudo certbot --nginx -d app.example.com -d api.example.com
sudo certbot renew --dry-run
```

## 9) Backup Cron Example

```cron
0 2 * * * pg_dump --format=custom --file=/var/backups/subidha/db-$(date +\%F).dump "$DATABASE_URL"
```

## 10) Restore Procedure

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /var/backups/subidha/db-YYYY-MM-DD.dump
cd /srv/subidha-core/backend
. .venv/bin/activate
python manage.py migrate --settings core.settings.production
python manage.py collectstatic --noinput --settings core.settings.production
```

Then verify:

- `/healthz/` returns 200
- `/readyz/` returns 200
- admin login works
