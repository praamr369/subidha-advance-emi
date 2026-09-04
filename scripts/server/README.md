# Server scripts — deploy, backup, restore

These run **on the VPS**, not on the dev machine. They implement
`docs/production-update-rollback-runbook.md` as three commands.

## One-time setup on the VPS

1. Copy or clone these scripts to the server and `chmod +x scripts/server/*.sh`.
2. Set the environment (edit defaults in each script, or export in the shell
   profile of the deploy user):

   | Variable | Meaning | Example |
   |---|---|---|
   | `DB_NAME` / `DB_USER` | Postgres database/user | `subidha` |
   | `APP_DIR` | Git checkout the app runs from | `/var/www/subidha/app` |
   | `MEDIA_ROOT` | Uploaded files (KYC, POD photos) | `/var/www/subidha/media` |
   | `BACKUP_ROOT` | Where backups are kept | `/var/backups/subidha` |
   | `SERVICE` | systemd unit for gunicorn | `subidha-gunicorn` |
   | `HEALTH_URL` | Deep health endpoint | `http://127.0.0.1:8000/api/v1/health/deep/` |

3. Nightly backup cron (as the deploy user):

   ```cron
   30 2 * * * /var/www/subidha/app/scripts/server/backup.sh scheduled >> /var/log/subidha-backup.log 2>&1
   ```

## Background jobs (Celery)

`subidha-celery.service` and `subidha-celery-beat.service` in this directory run
the seven scheduled jobs in `backend/system_jobs/tasks.py`: EMI due and overdue
reminders, rent due reminders, the accounting health check, the inventory
reorder check, the daily report snapshot, and the nightly failed-PDF rescan.

**These were absent from the VPS until 2026-09-04**, so none of those jobs had
ever run — `system_job_logs` was empty. Redis was already installed (it backs
the cache), but there was no worker, no beat, and no `CELERY_BROKER_URL`.

### One-time install

1. Add the broker URL to `/etc/subidha/backend.env`. **Use db 0** — the Django
   cache already occupies db 1 on the same Redis instance:

   ```
   CELERY_BROKER_URL=redis://127.0.0.1:6379/0
   ```

   Without this, `CELERY_BROKER_URL` resolves to an empty string outside local
   development (`backend/core/settings/base.py`) and the worker cannot start.

2. Install and enable both units:

   ```bash
   sudo cp /var/www/subidha/app/scripts/server/subidha-celery.service \
           /var/www/subidha/app/scripts/server/subidha-celery-beat.service \
           /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now subidha-celery subidha-celery-beat
   ```

3. Verify. The worker should report the seven tasks, and beat should log the
   next scheduled run:

   ```bash
   systemctl status subidha-celery subidha-celery-beat --no-pager
   journalctl -u subidha-celery -n 50 --no-pager
   ```

   Confirm a job actually lands (the first is EMI due reminders at 06:05
   Asia/Kolkata):

   ```bash
   sudo -u postgres psql -d subidha -c \
     "select job_type, status, started_at from system_job_logs order by id desc limit 10"
   ```

   To prove the wiring without waiting for 06:05, trigger one by hand:

   ```bash
   cd /var/www/subidha/app/backend && set -a && . /etc/subidha/backend.env && set +a \
     && .venv/bin/python -c \
        "from system_jobs.tasks import daily_accounting_health_check as t; print(t.delay())"
   ```

### Operational notes

- **Exactly one beat process** may run cluster-wide; two schedulers dispatch
  every job twice. The job bodies are date-keyed through `run_idempotent_job`,
  so a duplicate is skipped rather than double-applied, but that is a safety
  net, not the control.
- Task failures are written to `AuditLog` as `BACKGROUND_TASK_FAILED` (see
  `backend/core/celery.py`), so a failed run is visible in the admin UI rather
  than only in `journalctl`.
- `deploy.sh` restarts both units alongside gunicorn (`CELERY_SERVICES`), so a
  release cannot leave the worker executing the previous revision. It skips
  them without complaint when the units are not installed.

## Connection pooling (PgBouncer) — optional

`pgbouncer.ini` + `setup-pgbouncer.sh`. **Session** pooling, not transaction
pooling: 41 call sites use `QuerySet.iterator()`, which needs server-side
cursors, and Django requires `DISABLE_SERVER_SIDE_CURSORS=True` under
transaction pooling — which would buffer whole result sets in memory on the
ledger and stock exports.

Measured 2026-09-04: production ran **12 connections against `max_connections`
100** with 3 gunicorn workers. There is no pressure to relieve today, so this is
prepared rather than required. Revisit above ~12 workers or ~50 sustained
connections.

```bash
sudo apt-get install -y pgbouncer
sudo ./scripts/server/setup-pgbouncer.sh            # install + verify; app untouched
sudo ./scripts/server/setup-pgbouncer.sh --cutover  # move the app onto it
sudo ./scripts/server/setup-pgbouncer.sh --rollback # undo
```

Install and cutover are separate steps. After the first command PgBouncer is
running and proven to serve real queries while production still connects
directly, so stopping there costs nothing. `--cutover` health-checks and rolls
itself back automatically if the check fails.

`userlist.txt` is generated from `backend.env` and holds a **second copy of the
database password** (PgBouncer needs plaintext to authenticate outward under
scram-sha-256; a stored verifier only checks incoming clients). It is written
`0600 postgres:postgres` and never printed.

## Read replica — optional

`setup-replica.sh` provisions a streaming standby on port 5433.

```bash
sudo ./scripts/server/setup-replica.sh           # create + start the standby
sudo ./scripts/server/setup-replica.sh --status  # replication lag and slots
sudo ./scripts/server/setup-replica.sh --enable  # add DB_REPLICA_* to backend.env
sudo systemctl restart subidha-gunicorn
```

On the same host the standby shares disk and CPU, so it buys read **isolation**,
not read **capacity**. Moving it to its own host is what buys capacity.

Nothing routes to it automatically. `core/db_routers.ReplicaRouter` keeps writes
and migrations off it; reporting opts in explicitly:

```python
Model.objects.using(settings.REPLICA_DATABASE_ALIAS).filter(...)
```

That is deliberate. Replication lag is unbounded under load, and a trial balance
or ledger export built from a lagging standby reports figures that never existed
together while looking entirely plausible. `ATOMIC_REQUESTS` also means requests
routinely read rows they just wrote, which a standby cannot see.

Two things to watch once it is live: `hot_standby_feedback=on` means long
reporting queries on the standby hold back vacuum on the **primary**, so watch
for bloat if reports run for hours; and an inactive replication slot retains WAL
on the primary indefinitely, so drop the slot if you retire the standby.

## Daily use

**Release a new version** (after merging `update` -> `main` on GitHub):

```bash
./scripts/server/deploy.sh
```

What it does, in order: full backup -> restores that backup into a scratch DB
and rehearses the new migrations there -> only if rehearsal passes does it
migrate production -> restarts services -> health check -> tags the release.
**All live data is preserved** — customers, subscriptions, EMIs, payments,
accounting. `migrate` changes the schema around the data, never deletes it.
If anything fails before step 4, production was never touched.

**Take a manual backup anytime:**

```bash
./scripts/server/backup.sh manual
```

**Roll back after a bad deploy:**

```bash
./scripts/server/restore.sh /var/backups/subidha/pre-update-<stamp>
```

Asks for confirmation, snapshots the bad state first (so nothing is ever
destroyed), restores DB (+ optionally media), and rolls the code back to the
matching commit.

## What these scripts will NOT do

- They never run `loaddata` — the bootstrap fixture is for empty databases
  only (first install), never for a live one.
- `restore.sh` discards everything written after the chosen backup. If real
  payments were recorded after a bad deploy, do **not** plain-restore — follow
  Path C (restore to a side DB + replay) in the runbook.
- Rehearsal works out of the box: production settings already read the DB from
  `DATABASE_URL` or `DB_NAME` env vars (`backend/core/settings/base.py`), and
  `deploy.sh` overrides whichever one is in use to point at the scratch copy.
