#!/usr/bin/env bash
# Restore production to a previous backup (Path B in the rollback runbook).
# Usage: ./restore.sh /var/backups/subidha/pre-update-20260704-101500
# Restores DB + optionally media, rolls code back to the matching commit.
set -euo pipefail

DB_NAME="${DB_NAME:-subidha}"
DB_USER="${DB_USER:-subidha}"
APP_DIR="${APP_DIR:-/var/www/subidha/app}"
MEDIA_ROOT="${MEDIA_ROOT:-/var/www/subidha/media}"
SERVICE="${SERVICE:-subidha-gunicorn}"

BACKUP_DIR="${1:?Usage: ./restore.sh <backup-folder>}"
[ -f "$BACKUP_DIR/db.dump" ] || { echo "No db.dump in $BACKUP_DIR"; exit 1; }

echo "!!! This restores '$DB_NAME' to the state in: $BACKUP_DIR"
echo "!!! Everything written AFTER that backup will be LOST from the live DB."
read -r -p "Type RESTORE to continue: " CONFIRM
[ "$CONFIRM" = "RESTORE" ] || { echo "Aborted."; exit 1; }

echo "==> [1/5] Stopping app (no writes during restore)"
sudo systemctl stop "$SERVICE"

echo "==> [2/5] Safety: dumping CURRENT (bad) state before overwriting"
STAMP="$(date +%Y%m%d-%H%M%S)"
pg_dump -Fc -U "$DB_USER" -d "$DB_NAME" -f "$BACKUP_DIR/../post-incident-$STAMP.dump" || true

echo "==> [3/5] Restoring database"
dropdb -U "$DB_USER" "$DB_NAME"
createdb -U "$DB_USER" "$DB_NAME"
pg_restore -U "$DB_USER" -d "$DB_NAME" "$BACKUP_DIR/db.dump"

if [ -f "$BACKUP_DIR/media.tar.gz" ]; then
  read -r -p "Also restore media files? (y/N): " MEDIA_ANS
  if [ "$MEDIA_ANS" = "y" ]; then
    echo "==> Restoring media"
    tar -xzf "$BACKUP_DIR/media.tar.gz" -C "$MEDIA_ROOT"
  fi
fi

echo "==> [4/5] Rolling code back to the commit that matches this DB"
if [ -f "$BACKUP_DIR/deployed-commit.txt" ]; then
  git -C "$APP_DIR" checkout -q "$(cat "$BACKUP_DIR/deployed-commit.txt")"
  echo "    Code at $(cat "$BACKUP_DIR/deployed-commit.txt")"
else
  echo "    No deployed-commit.txt found — leave code as-is or check out manually."
fi

echo "==> [5/5] Restarting"
sudo systemctl start "$SERVICE"
echo "==> Restore complete. Run your smoke checks now (login, dashboard, EMI register)."
