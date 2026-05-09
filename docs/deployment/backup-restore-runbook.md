# Backup and Restore Runbook

## Scope
Operational backup and restore for pre-production and production safety.

## Backup Policy
- Backup database before every migration/deploy.
- Backup media/uploads on schedule.
- Keep minimum retention window (for example 30 days).
- Validate at least one restore rehearsal per release cycle.

## Database Backup (PostgreSQL Example)
```bash
set -a
. /etc/subidha-core/backend.env
set +a
mkdir -p /var/backups/subidha/db
pg_dump --format=custom --file="/var/backups/subidha/db/db-$(date +%F-%H%M).dump" "$DATABASE_URL"
```

## Media Backup
```bash
mkdir -p /var/backups/subidha/media
rsync -a --delete /srv/subidha-core/media/ /var/backups/subidha/media/
```

## Restore (Staging First)
```bash
set -a
. /etc/subidha-core/backend.env
set +a
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /var/backups/subidha/db/db-YYYY-MM-DD-HHMM.dump
rsync -a /var/backups/subidha/media/ /srv/subidha-core/media/
```

Then:
```bash
cd /srv/subidha-core/backend
. .venv/bin/activate
python manage.py migrate --settings core.settings.production
python manage.py check --settings core.settings.production
```

## Safety Rules
- Never run destructive reset commands on production.
- `reset_business_data` is allowed only in local/staging with explicit confirmation.
- Preserve uploaded media during rollback/restore operations.
