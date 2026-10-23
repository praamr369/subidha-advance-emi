#!/usr/bin/env bash
# Safe production deploy: backup -> rehearse migrations -> deploy -> smoke check.
# Usage: ./deploy.sh            (deploys latest origin/main)
# All live data (customers, EMIs, payments, accounting) is preserved —
# 'migrate' upgrades the schema in place. The backup is the undo button.
set -euo pipefail

DB_NAME="${DB_NAME:-subidha}"
APP_DIR="${APP_DIR:-/var/www/subidha/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/subidha}"
SERVICE="${SERVICE:-subidha-gunicorn}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-subidha-frontend}"
CELERY_SERVICES="${CELERY_SERVICES:-subidha-celery subidha-celery-beat}"
BACKEND_ENV="${BACKEND_ENV:-/etc/subidha/backend.env}"
FRONTEND_ENV="${FRONTEND_ENV:-/etc/subidha/frontend.env}"
HEALTH_URL="${HEALTH_URL:-https://subidhafurnitureasansol.com/api/v1/public/health/}"
PY="$APP_DIR/backend/.venv/bin/python"
PIP="$APP_DIR/backend/.venv/bin/pip"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STAMP="$(date +%Y%m%d-%H%M%S)"

echo "==> [1/7] Checking for a new release"
cd "$APP_DIR"
if ! git fetch origin; then
  echo ""
  echo "!!! 'git fetch origin' failed on the server."
  echo "    If you see 'Permission denied (publickey)':"
  echo "    1. View the VPS public SSH key:"
  echo "       cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub"
  echo "    2. Add that key as a Deploy Key on GitHub:"
  echo "       https://github.com/praamr369/subidha-advance-emi/settings/keys"
  echo "    3. Or switch origin to HTTPS with personal access token or test: ssh -T git@github.com"
  exit 1
fi
NEW_COMMIT="$(git rev-parse origin/main)"
OLD_COMMIT="$(git rev-parse HEAD)"
if [ "$NEW_COMMIT" = "$OLD_COMMIT" ]; then
  echo "    Already on latest main ($OLD_COMMIT). Nothing to deploy."; exit 0
fi
echo "    $OLD_COMMIT -> $NEW_COMMIT"

echo "==> [2/7] Pre-update backup (this is your rollback point)"
"$SCRIPT_DIR/backup.sh" pre-update
LATEST_BACKUP="$(ls -1dt "$BACKUP_ROOT"/pre-update-* | head -n 1)"
echo "    Rollback point: $LATEST_BACKUP"

echo "==> [3/7] Rehearsing migrations on a copy of the live DB"
# Postgres identifiers can't contain hyphens unquoted — use underscores only.
REHEARSAL_DB="${DB_NAME}_rehearsal_${STAMP//-/_}"
sudo -u postgres createdb "$REHEARSAL_DB"
trap 'sudo -u postgres dropdb --if-exists "$REHEARSAL_DB"' EXIT
sudo -u postgres pg_restore -d "$REHEARSAL_DB" "$LATEST_BACKUP/db.dump"
sudo -u postgres psql -q -c "GRANT ALL ON DATABASE $REHEARSAL_DB TO $DB_NAME" || true
sudo -u postgres psql -q -d "$REHEARSAL_DB" -c "GRANT ALL ON SCHEMA public TO $DB_NAME" || true
git checkout -q "$NEW_COMMIT"
cd "$APP_DIR/backend"
"$PIP" install -q -r requirements.txt
set -a; . "$BACKEND_ENV"; set +a
# The rehearsal DB is created ad hoc, so it is not in PgBouncer's [databases]
# list — connecting through the pooler fails with "no such database" before a
# single migration runs, which reads as a migration failure and aborts a
# perfectly good deploy. Point the rehearsal at the real cluster instead. The
# pooler is what production traffic uses; rehearsing the schema change does not
# need it, and bypassing it also keeps the rehearsal off the production pool.
REHEARSAL_DB_HOST="${REHEARSAL_DB_HOST:-127.0.0.1}"
REHEARSAL_DB_PORT="${REHEARSAL_DB_PORT:-5432}"
if ! DB_NAME="$REHEARSAL_DB" \
     DB_HOST="$REHEARSAL_DB_HOST" \
     DB_PORT="$REHEARSAL_DB_PORT" \
     "$PY" manage.py migrate --no-input; then
  echo "!!! Migration FAILED on the rehearsal copy. Production untouched."
  echo "    Reverting code checkout. Fix the migration in dev and redeploy."
  git checkout -q "$OLD_COMMIT"
  exit 1
fi
echo "    Rehearsal migration OK."

echo "==> [4/7] Applying to production"
"$PY" manage.py migrate --no-input
"$PY" manage.py collectstatic --no-input | tail -1
"$PY" manage.py check --deploy || true

echo "==> [5/7] Building frontend"
cd "$APP_DIR/frontend"
cp "$FRONTEND_ENV" .env.production
npm ci --no-audit --no-fund > /tmp/npm-deploy.log 2>&1
NEXT_BUILD_CPUS=1 NODE_OPTIONS='--max-old-space-size=4096' npm run build > /tmp/next-build-deploy.log 2>&1 \
  || { echo "!!! Frontend build FAILED:"; tail -20 /tmp/next-build-deploy.log; git -C "$APP_DIR" checkout -q "$OLD_COMMIT"; exit 1; }

echo "==> [6/7] Restarting services"
# When the app runs as the non-root 'subidha' account (systemd drop-ins set
# User=subidha), the freshly rebuilt .next and the media tree must be owned by
# it: next-server writes .next/cache (image/ISR cache) at runtime and Django
# writes uploads under MEDIA_ROOT. The build/collectstatic above ran as root, so
# .next is re-created root-owned every release and must be handed back. No-op
# until the service user exists, so this stays safe on a root-run host.
if id subidha >/dev/null 2>&1; then
  echo "    non-root app: chowning .next + media to subidha"
  chown -R subidha:subidha "$APP_DIR/frontend/.next" "${MEDIA_ROOT:-/var/www/subidha/media}" 2>/dev/null || true
fi
echo "    restarting backend and frontend in parallel"
# Gunicorn supports a graceful reload, so existing requests finish on the
# previous workers while new workers load the new code. The frontend is
# stopped first so a manually-started next-server cannot steal port 3000 from
# systemd and create a restart loop.
systemctl reload-or-restart "$SERVICE" &
BACKEND_RESTART_PID=$!
systemctl stop "$FRONTEND_SERVICE" || true
for pid in $(ss -ltnp "sport = :3000" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u); do
  kill "$pid" 2>/dev/null || true
done
systemctl start "$FRONTEND_SERVICE" &
FRONTEND_RESTART_PID=$!

# Background workers run the same codebase, so a release that restarts only
# gunicorn leaves them executing the previous revision until something else
# restarts them. Skipped without complaint when the units are not installed,
# so this stays safe on a host that does not run background jobs.
for unit in $CELERY_SERVICES; do
  if systemctl list-unit-files "$unit.service" --no-legend 2>/dev/null | grep -q .; then
    echo "    restarting $unit"
    systemctl restart "$unit" &
  else
    echo "    $unit not installed — skipping"
  fi
done

wait "$BACKEND_RESTART_PID" "$FRONTEND_RESTART_PID"
for unit in $CELERY_SERVICES; do
  if systemctl list-unit-files "$unit.service" --no-legend 2>/dev/null | grep -q .; then
    systemctl is-active --quiet "$unit"
  fi
done

echo "==> [7/7] Smoke check"
sleep 5
HEALTH_OK=false
for attempt in 1 2 3; do
  if curl -fsSk "$HEALTH_URL" > /dev/null; then
    HEALTH_OK=true
    break
  fi
  echo "    Health check attempt $attempt/3 failed, retrying in 3s..."
  sleep 3
done

if [ "$HEALTH_OK" = "true" ]; then
  echo "    Health check OK."
else
  echo "!!! Health check FAILED after deployment."
  echo "    Initiating automated self-healing rollback to $LATEST_BACKUP..."
  if [ -x "$SCRIPT_DIR/restore.sh" ] && [ -n "${LATEST_BACKUP:-}" ]; then
    RESTORE_FORCE=true "$SCRIPT_DIR/restore.sh" "$LATEST_BACKUP" || true
    echo "    Automated rollback to $LATEST_BACKUP completed."
  fi
  exit 1
fi

cd "$APP_DIR"
git tag -f "prod-$STAMP" && git push -f origin "prod-$STAMP" 2>/dev/null || true
echo "==> Deploy complete: $NEW_COMMIT (tagged prod-$STAMP)"
echo "    Rollback point kept at: $LATEST_BACKUP"
