# Backup and Restore Runbook

## Backup Policy

- Frequency: daily full backup + pre-release backup.
- Retention: minimum 14 days (recommended 30+).
- Encrypt backups at rest.
- Store outside application host volume.

## Database Backup

```bash
pg_dump --format=custom --file=/var/backups/subidha/db-$(date +%F).dump "$DATABASE_URL"
```

## Media Backup

```bash
rsync -a --delete /srv/subidha-core/media/ /var/backups/subidha/media/
```

## Restore Procedure

1. Stop write traffic.
2. Restore DB:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /var/backups/subidha/db-YYYY-MM-DD.dump
```

3. Restore media:

```bash
rsync -a /var/backups/subidha/media/ /srv/subidha-core/media/
```

4. Reconcile schema + static:

```bash
cd /srv/subidha-core/backend
. .venv/bin/activate
python manage.py migrate --settings core.settings.production
python manage.py collectstatic --noinput --settings core.settings.production
```

5. Validate:
   - `GET /healthz/` = 200
   - `GET /readyz/` = 200
   - admin login
   - customer and partner scoped access checks

## Recovery Verification Checklist

- no orphan receipts
- payment reconciliation state preserved
- EMI/rent/lease schedules intact
- stock ledger continuity preserved
- dashboards load without aggregate errors
