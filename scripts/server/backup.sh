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
# Backups hold the full database dump (customer PII, KYC, financials) and all
# uploaded media. pg_dump/mv would otherwise leave db.dump group/world-readable
# (0664) on a host with several service users. Restrict to root plus the app
# service account only: when the "subidha" service user exists (the app runs as
# it, non-root), own the tree root:subidha 0750/0640 so the in-app backup and
# download feature keeps working while postgres/www-data/other users are shut
# out. Before that migration, or on any host without the user, fall back to
# strict root-only 0700/0600.
BACKUP_OWNER_GROUP="${BACKUP_OWNER_GROUP:-subidha}"
if getent group "$BACKUP_OWNER_GROUP" >/dev/null 2>&1; then
  chgrp "$BACKUP_OWNER_GROUP" "$BACKUP_ROOT" "$DEST" 2>/dev/null || true
  chmod 750 "$BACKUP_ROOT" "$DEST" 2>/dev/null || true
else
  chmod 700 "$BACKUP_ROOT" 2>/dev/null || true
  chmod 700 "$DEST"
fi

echo "==> Backing up database '$DB_NAME' ..."
sudo -u postgres pg_dump -Fc -d "$DB_NAME" -f "/tmp/db-$STAMP.dump"
mv "/tmp/db-$STAMP.dump" "$DEST/db.dump"

echo "==> Verifying dump is restorable ..."
pg_restore --list "$DEST/db.dump" > /dev/null

echo "==> Archiving media from $MEDIA_ROOT ..."
tar -czf "$DEST/media.tar.gz" -C "$MEDIA_ROOT" .

echo "==> Recording deployed commit + migration state ..."
git -C "$APP_DIR" rev-parse HEAD > "$DEST/deployed-commit.txt" 2>/dev/null || true
(cd "$APP_DIR/backend" && set -a && . /etc/subidha/backend.env && set +a && ./.venv/bin/python manage.py showmigrations --plan | tail -n 40 > "$DEST/migration-state.txt") 2>/dev/null || true

sha256sum "$DEST"/* > "$DEST/checksums.txt"
# Restrict every artifact regardless of the umask pg_dump/tar ran with. Group
# read (0640) when the service group exists so the non-root app can serve
# downloads; strict owner-only (0600) otherwise. Never group/world writable.
if getent group "$BACKUP_OWNER_GROUP" >/dev/null 2>&1; then
  chgrp "$BACKUP_OWNER_GROUP" "$DEST"/* 2>/dev/null || true
  chmod 640 "$DEST"/* 2>/dev/null || true
else
  chmod 600 "$DEST"/* 2>/dev/null || true
fi
du -sh "$DEST"
echo "==> Backup complete: $DEST"

# Retention: keep last 7 'scheduled' backups (label-specific).
# Guarded with `|| true` so an empty glob under `set -o pipefail` never aborts
# the caller (e.g. deploy.sh runs this as its first step).
ls -1dt "$BACKUP_ROOT"/scheduled-* 2>/dev/null | tail -n +8 | xargs -r rm -rf || true
