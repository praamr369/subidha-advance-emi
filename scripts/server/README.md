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
