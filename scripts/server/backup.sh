#!/usr/bin/env bash
# Full production backup: database + media files.
# Usage: ./backup.sh [label]        e.g. ./backup.sh pre-update
# Configure via environment or edit the defaults below.
set -euo pipefail

DB_NAME="${DB_NAME:-subidha}"
DB_USER="${DB_USER:-subidha}"
MEDIA_ROOT="${MEDIA_ROOT:-/var/www/subidha/media}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/subidha}"
APP_DIR="${APP_DIR:-/var/www/subidha/app}"

LABEL="${1:-scheduled}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$LABEL-$STAMP"
mkdir -p "$DEST"

echo "==> Backing up database '$DB_NAME' ..."
pg_dump -Fc -U "$DB_USER" -d "$DB_NAME" -f "$DEST/db.dump"

echo "==> Verifying dump is restorable ..."
pg_restore --list "$DEST/db.dump" > /dev/null

echo "==> Archiving media from $MEDIA_ROOT ..."
tar -czf "$DEST/media.tar.gz" -C "$MEDIA_ROOT" .

echo "==> Recording deployed commit + migration state ..."
git -C "$APP_DIR" rev-parse HEAD > "$DEST/deployed-commit.txt" 2>/dev/null || true
(cd "$APP_DIR/backend" && python manage.py showmigrations --plan | tail -n 40 > "$DEST/migration-state.txt") 2>/dev/null || true

sha256sum "$DEST"/* > "$DEST/checksums.txt"
du -sh "$DEST"
echo "==> Backup complete: $DEST"

# Retention: keep last 7 'scheduled' backups (label-specific)
ls -1dt "$BACKUP_ROOT"/scheduled-* 2>/dev/null | tail -n +8 | xargs -r rm -rf
