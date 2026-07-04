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
FRONTEND_SERVICE="${FRONTEND_SERVICE:-subidha-next}"
BACKEND_ENV="${BACKEND_ENV:-/etc/subidha/backend.env}"
FRONTEND_ENV="${FRONTEND_ENV:-/etc/subidha/frontend.env}"
HEALTH_URL="${HEALTH_URL:-https://srv1391250.hstgr.cloud/api/v1/health/}"
PY="$APP_DIR/backend/.venv/bin/python"
PIP="$APP_DIR/backend/.venv/bin/pip"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STAMP="$(date +%Y%m%d-%H%M%S)"

echo "==> [1/7] Pre-update backup (this is your rollback point)"
"$SCRIPT_DIR/backup.sh" pre-update
LATEST_BACKUP="$(ls -1dt "$BACKUP_ROOT"/pre-update-* | head -n 1)"
echo "    Rollback point: $LATEST_BACKUP"

echo "==> [2/7] Fetching new code"
cd "$APP_DIR"
git fetch origin
NEW_COMMIT="$(git rev-parse origin/main)"
OLD_COMMIT="$(git rev-parse HEAD)"
if [ "$NEW_COMMIT" = "$OLD_COMMIT" ]; then
  echo "    Already on latest main ($OLD_COMMIT). Nothing to deploy."; exit 0
fi
echo "    $OLD_COMMIT -> $NEW_COMMIT"

echo "==> [3/7] Rehearsing migrations on a copy of the live DB"
REHEARSAL_DB="${DB_NAME}_rehearsal_$STAMP"
sudo -u postgres createdb "$REHEARSAL_DB"
trap 'sudo -u postgres dropdb --if-exists "$REHEARSAL_DB"' EXIT
sudo -u postgres pg_restore -d "$REHEARSAL_DB" "$LATEST_BACKUP/db.dump"
sudo -u postgres psql -q -c "GRANT ALL ON DATABASE $REHEARSAL_DB TO $DB_NAME" || true
git checkout -q "$NEW_COMMIT"
cd "$APP_DIR/backend"
"$PIP" install -q -r requirements.txt
set -a; . "$BACKEND_ENV"; set +a
if ! DB_NAME="$REHEARSAL_DB" "$PY" manage.py migrate --no-input; then
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
NODE_OPTIONS='--max-old-space-size=6144' npm run build > /tmp/next-build-deploy.log 2>&1 \
  || { echo "!!! Frontend build FAILED:"; tail -20 /tmp/next-build-deploy.log; git -C "$APP_DIR" checkout -q "$OLD_COMMIT"; exit 1; }

echo "==> [6/7] Restarting services"
systemctl restart "$SERVICE"
systemctl restart "$FRONTEND_SERVICE"

echo "==> [7/7] Smoke check"
sleep 5
if curl -fsSk "$HEALTH_URL" > /dev/null; then
  echo "    Health check OK."
else
  echo "!!! Health check FAILED. Roll back with:"
  echo "    $SCRIPT_DIR/restore.sh $LATEST_BACKUP"
  exit 1
fi

cd "$APP_DIR"
git tag -f "prod-$STAMP" && git push -f origin "prod-$STAMP" 2>/dev/null || true
echo "==> Deploy complete: $NEW_COMMIT (tagged prod-$STAMP)"
echo "    Rollback point kept at: $LATEST_BACKUP"
