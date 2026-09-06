# Production Update & Rollback Runbook

How to push an update from `update` → `main` to the live server **without ever
being able to lose data**, and exactly what to do when an update fails.

Related: `docs/backup-restore-runbook.md` (daily backups, RPO/RTO),
`docs/incident-response.md`, `backend/fixtures/README.md` (fresh-DB bootstrap —
**never** used on a live database).

---

## Golden rules

1. **Backup BEFORE every update, no exceptions.** The pre-update backup is your
   undo button. If it doesn't exist, the update does not happen.
2. **The live database is the source of truth.** Code can always be rolled back
   with git; data can only be rolled back with a backup.
3. **Never run `loaddata` on a live database.** It overwrites rows by primary
   key. The bootstrap fixture is for empty databases only.
4. **Migrations forward, code backward is the danger zone.** If a migration has
   already run, rolling back only the code can crash (old code, new schema).
   Follow the decision table in section 4.

---

## 1. Before the update (on the VPS)

```bash
# 1a. Create a timestamped pre-update backup folder
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_ROOT/pre-update-$STAMP"

# 1b. Database dump (Postgres)
pg_dump -Fc -U <db_user> -d <db_name> \
  -f "$BACKUP_ROOT/pre-update-$STAMP/db.dump"

# 1c. Media files (KYC docs, brochures, POD photos, signatures)
tar -czf "$BACKUP_ROOT/pre-update-$STAMP/media.tar.gz" -C <MEDIA_ROOT> .

# 1d. Record what is currently deployed (needed for rollback)
cd /path/to/app && git rev-parse HEAD > "$BACKUP_ROOT/pre-update-$STAMP/deployed-commit.txt"
python manage.py showmigrations --plan | tail -n 20 > "$BACKUP_ROOT/pre-update-$STAMP/migration-state.txt"

# 1e. Verify the dump is restorable (cheap, do it every time)
pg_restore --list "$BACKUP_ROOT/pre-update-$STAMP/db.dump" > /dev/null && echo "DUMP OK"
```

If the site is busy, put it in maintenance mode now (stop accepting writes)
so the backup and the update see the same data.

## 2. Rehearse the migration BEFORE touching production

Never let production be the first database that runs a new migration.

```bash
# On the VPS (or locally): restore the fresh dump into a scratch database
createdb <db_name>_rehearsal
pg_restore -U <db_user> -d <db_name>_rehearsal "$BACKUP_ROOT/pre-update-$STAMP/db.dump"

# Point a shell at the rehearsal DB and run the new code's migrations
DATABASE_URL=postgres://.../<db_name>_rehearsal python manage.py migrate
DATABASE_URL=postgres://.../<db_name>_rehearsal python manage.py check
```

If the rehearsal migration fails → **stop**. Fix the migration in dev, push a
new commit, rehearse again. Production was never touched; nothing to recover.

## 3. The update itself

```bash
cd /path/to/app
git fetch origin
git checkout main && git pull origin main     # after merging update -> main
pip install -r requirements.txt               # backend deps if changed
python manage.py migrate                      # already rehearsed, low risk
python manage.py collectstatic --noinput
# rebuild/restart frontend if it changed
sudo systemctl restart subidha-gunicorn subidha-next subidha-celery subidha-celery-beat
```

Smoke test immediately: log in, open the admin dashboard, open one customer,
one EMI register page, `GET /api/v1/health/deep/`.

## 3b. What is actually running (as of 2026-09-06)

Six services. A rollback that restarts only gunicorn leaves three of them on
the old code or in the wrong state.

| Service | Role | If it is down |
|---|---|---|
| `subidha-gunicorn` | Django/API | Site is down |
| `subidha-next` | Frontend | Site is down |
| `subidha-celery` | Background worker | Seven daily jobs silently stop; failures land in `AuditLog` as `BACKGROUND_TASK_FAILED` |
| `subidha-celery-beat` | Scheduler | Same, and nothing dispatches |
| `pgbouncer` | Connection pooler on **127.0.0.1:6432** | **Total outage** — the app connects through it, not directly |
| `postgresql@16-replica` | Read standby on **5433** | Reporting that opts in via `settings.REPLICA_DATABASE_ALIAS` fails; nothing else |

**The pooler is in the query path.** `DB_PORT=6432` in `/etc/subidha/backend.env`.
If the database seems unreachable, check pgbouncer before PostgreSQL. To take it
out of the path entirely:

```bash
sudo ./scripts/server/setup-pgbouncer.sh --rollback   # back to direct 5432
```

**The standby is not a backup.** It replicates deletions and bad migrations in
seconds. Restores come from `$BACKUP_ROOT`, never from the replica. Check lag
and slot health with:

```bash
sudo ./scripts/server/setup-replica.sh --status
```

An inactive replication slot retains WAL on the primary indefinitely — if the
standby is retired, drop the slot or the primary's disk fills.

## 4. When something goes wrong — decision table

| Symptom | What happened | Recovery path |
|---|---|---|
| `migrate` failed partway | Django wraps each migration in a transaction on Postgres — the failed one rolled back, earlier ones in the same run did not | Path B |
| `migrate` succeeded but the app crashes / wrong behavior | New code bug, schema is fine | Path A if the migration is reversible, Path B if not |
| App ran for a while on the bad version and **wrote data you must keep** | Data written on top of a bad schema/code | Path C — do NOT blindly restore |
| Data corrupted or deleted by the bad version | Worst case | Path B (accept losing the post-update writes) or Path C if they must be kept |

### Path A — code rollback (no data touched)

Use when the database schema is still compatible with the previous code.

```bash
cd /path/to/app
git checkout $(cat "$BACKUP_ROOT/pre-update-$STAMP/deployed-commit.txt")
# If the update's migrations are reversible, undo just those:
python manage.py migrate <app_label> <last_good_migration_name>
sudo systemctl restart subidha-gunicorn subidha-celery subidha-celery-beat
```

Find `<last_good_migration_name>` in `migration-state.txt` from step 1d.
No data is lost — this only reverts schema changes made by the update.

### Path B — full restore from the pre-update backup

Use when the schema/data is in a bad state and the post-update writes are
disposable (you rolled back within minutes).

```bash
# 1. Stop EVERYTHING that writes, not just the web tier. Celery workers run
#    the same codebase and will keep writing to the database during the
#    restore if left running.
sudo systemctl stop subidha-gunicorn subidha-celery subidha-celery-beat

# 2. Restore the database (drop-and-recreate is the clean way)
dropdb <db_name>          # or: ALTER DATABASE ... RENAME for extra safety
createdb <db_name>
pg_restore -U <db_user> -d <db_name> "$BACKUP_ROOT/pre-update-$STAMP/db.dump"

# 3. Restore media only if the bad version deleted/overwrote files
# tar -xzf "$BACKUP_ROOT/pre-update-$STAMP/media.tar.gz" -C <MEDIA_ROOT>

# 4. Roll the code back to what matches this database
git checkout $(cat "$BACKUP_ROOT/pre-update-$STAMP/deployed-commit.txt")

# 5. Restart and smoke test
sudo systemctl start subidha-gunicorn subidha-celery subidha-celery-beat
```

Result: the server is byte-for-byte back to the moment before the update.
Anything written between the update and the restore is gone — which is why
you smoke test immediately after every update (section 3), so this window
is minutes, not days.

### Path C — restore + replay (bad update discovered late)

Use when the app ran for hours/days on the bad version and real business data
(payments, EMIs, new customers) was written that you cannot throw away.

1. **Stop the app.** Take a NEW backup of the current (bad) state first —
   never destroy evidence: `pg_dump -Fc ... -f post-incident-$STAMP.dump`.
2. Restore the pre-update backup into a **separate** database
   (`<db_name>_recovered`), not over the live one.
3. Diff the two databases to find rows created after the update. The reliable
   way in this app: every money-touching table has `created_at` — export rows
   with `created_at > <update timestamp>` from the bad DB:
   payments, EMI status changes, billing receipts, journal entries,
   money movements, new customers/subscriptions.
4. Re-enter or script-import those rows into the recovered database **through
   the application/service layer** (not raw SQL) so ledgers, EMI statuses,
   and journal entries stay consistent — this app posts accounting entries as
   side effects, so raw row copies will break reconciliation.
5. Run the reconciliation module against the recovered DB before switching:
   `subscriptions_payment` totals vs `accounting` journals vs FinancialLedger.
6. Swap: rename `<db_name>` → `<db_name>_bad`, `<db_name>_recovered` → `<db_name>`,
   roll code to the fixed version, restart, full smoke test.

Path C is slow and manual by design — it is the price of discovering a bad
update late. The daily backups + immediate post-update smoke tests exist to
make sure you almost never need it.

## 5. Make this cheap: standing infrastructure

- **Daily `pg_dump` + media archive via cron** (see backup-restore-runbook.md).
  Update RPO from 24h to hourly WAL archiving later if the business grows.
- **Keep the last 7 daily + 4 weekly + 3 monthly backups.** Disk is cheaper
  than data.
- **Monthly restore drill:** restore the latest backup into a scratch DB and
  run the smoke checks. A backup that has never been restored is a hope, not
  a backup.
- **Tag every production deploy:** `git tag prod-$STAMP && git push --tags`.
  Rollback target is then always obvious.
- **Never hotfix on the server.** All changes go dev → `update` → rehearse →
  `main` → deploy. A server with local edits cannot be rolled back with git.

## 6. Quick reference card

```text
UPDATE:   backup → verify dump → rehearse migration on copy → deploy → migrate → smoke test
FAILURE (caught immediately):  Path A (code rollback) or Path B (restore pre-update dump)
FAILURE (caught late, data written): Path C (restore to side DB + replay via app layer)
NEVER:    loaddata on live DB · hotfix on server · migrate without a fresh backup
```
