#!/usr/bin/env bash
# Safe production deploy: backup -> rehearse migrations -> deploy -> smoke check.
# Usage: ./deploy.sh            (deploys latest origin/main)
# All live data (customers, EMIs, payments, accounting) is preserved —
# 'migrate' upgrades the schema in place. The backup is the undo button.
set -euo pipefail

DB_NAME="${DB_NAME:-subidha}"
DB_USER="${DB_USER:-subidha}"
APP_DIR="${APP_DIR:-/var/www/subidha/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/subidha}"
SERVICE="${SERVICE:-subidha-gunicorn}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-subidha-next}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8000/api/v1/health/deep/}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STAMP="$(date +%Y%m%d-%H%M%S)"

echo "==> [1/6] Pre-update backup (this is your rollback point)"
"$SCRIPT_DIR/backup.sh" pre-update
LATEST_BACKUP="$(ls -1dt "$BACKUP_ROOT"/pre-update-* | head -n 1)"
echo "    Rollback point: $LATEST_BACKUP"

echo "==> [2/6] Fetching new code"
cd "$APP_DIR"
git fetch origin
NEW_COMMIT="$(git rev-parse origin/main)"
OLD_COMMIT="$(git rev-parse HEAD)"
if [ "$NEW_COMMIT" = "$OLD_COMMIT" ]; then
  echo "    Already on latest main ($OLD_COMMIT). Nothing to deploy."; exit 0
fi
echo "    $OLD_COMMIT -> $NEW_COMMIT"

echo "==> [3/6] Rehearsing migrations on a copy of the live DB"
REHEARSAL_DB="${DB_NAME}_rehearsal_$STAMP"
createdb -U "$DB_USER" "$REHEARSAL_DB"
trap 'dropdb -U "$DB_USER" --if-exists "$REHEARSAL_DB"' EXIT
pg_restore -U "$DB_USER" -d "$REHEARSAL_DB" "$LATEST_BACKUP/db.dump"
git checkout -q "$NEW_COMMIT"
cd "$APP_DIR/backend"
pip install -q -r requirements.txt
# Settings read DATABASE_URL first, then DB_NAME — override whichever is in use
if [ -n "${DATABASE_URL:-}" ]; then
  REHEARSAL_ENV="DATABASE_URL=$(echo "$DATABASE_URL" | sed "s|/[^/]*$|/$REHEARSAL_DB|")"
else
  REHEARSAL_ENV="DB_NAME=$REHEARSAL_DB"
fi
if ! env "$REHEARSAL_ENV" python manage.py migrate --no-input; then
  echo "!!! Migration FAILED on the rehearsal copy. Production untouched."
  echo "    Reverting code checkout. Fix the migration in dev and redeploy."
  git checkout -q "$OLD_COMMIT"
  exit 1
fi
echo "    Rehearsal migration OK."

echo "==> [4/6] Applying to production"
python manage.py migrate --no-input
python manage.py collectstatic --no-input
python manage.py check --deploy || true

echo "==> [5/6] Restarting services"
sudo systemctl restart "$SERVICE"
sudo systemctl restart "$FRONTEND_SERVICE" 2>/dev/null || true

echo "==> [6/6] Smoke check"
sleep 3
if curl -fsS "$HEALTH_URL" > /dev/null; then
  echo "    Health check OK."
else
  echo "!!! Health check FAILED. Roll back with:"
  echo "    ./restore.sh $LATEST_BACKUP"
  exit 1
fi

git tag -f "prod-$STAMP" && git push -f origin "prod-$STAMP" 2>/dev/null || true
echo "==> Deploy complete: $NEW_COMMIT (tagged prod-$STAMP)"
echo "    Rollback point kept at: $LATEST_BACKUP"
