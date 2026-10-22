#!/usr/bin/env bash
# Automated Offsite Backup: Local Snapshot + Optional Encryption + Free Cloud Sync (rclone)
# Zero-cost disaster recovery using Google Drive / Cloud storage free tier via rclone.
#
# Usage:
#   ./backup-offsite.sh
#
# Environment variables:
#   OFFSITE_REMOTE       rclone remote and path (default: gdrive:subidha-backups)
#   BACKUP_ROOT          local backup directory (default: /var/backups/subidha)
#   BACKUP_PASSPHRASE    optional passphrase for AES-256 encryption
#   RETENTION_DAYS       days of backups to keep (default: 14)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/subidha}"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-gdrive:subidha-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-}"

echo "==> [1/4] Running local full backup..."
"$SCRIPT_DIR/backup.sh" daily-offsite

LATEST_BACKUP="$(ls -1dt "$BACKUP_ROOT"/daily-offsite-* 2>/dev/null | head -n 1)"
if [ -z "$LATEST_BACKUP" ] || [ ! -d "$LATEST_BACKUP" ]; then
  echo "Error: No backup directory found matching daily-offsite-* in $BACKUP_ROOT" >&2
  exit 1
fi

BACKUP_FOLDER="$(basename "$LATEST_BACKUP")"
ARCHIVE_TAR="$BACKUP_ROOT/$BACKUP_FOLDER.tar.gz"

echo "==> [2/4] Packaging snapshot $BACKUP_FOLDER..."
tar -czf "$ARCHIVE_TAR" -C "$BACKUP_ROOT" "$BACKUP_FOLDER"

UPLOAD_TARGET="$ARCHIVE_TAR"

if [ -n "$BACKUP_PASSPHRASE" ]; then
  echo "==> [3/4] Encrypting archive with AES-256-CBC..."
  ARCHIVE_ENC="$BACKUP_ROOT/$BACKUP_FOLDER.tar.gz.enc"
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$ARCHIVE_TAR" -out "$ARCHIVE_ENC" -k "$BACKUP_PASSPHRASE"
  rm -f "$ARCHIVE_TAR"
  UPLOAD_TARGET="$ARCHIVE_ENC"
else
  echo "==> [3/4] Encryption passphrase not set. Archiving unencrypted (set BACKUP_PASSPHRASE to enable AES-256)."
fi

echo "==> [4/4] Syncing to offsite cloud ($OFFSITE_REMOTE)..."
if command -v rclone >/dev/null 2>&1; then
  # Test if the remote is configured
  REMOTE_NAME="${OFFSITE_REMOTE%%:*}"
  if rclone listremotes 2>/dev/null | grep -q "^${REMOTE_NAME}:"; then
    rclone copy "$UPLOAD_TARGET" "$OFFSITE_REMOTE" --stats 5s
    echo "==> Offsite upload successful."
    
    # Prune offsite backups older than retention days
    echo "==> Pruning remote backups older than $RETENTION_DAYS days..."
    rclone delete --min-age "${RETENTION_DAYS}d" "$OFFSITE_REMOTE" 2>/dev/null || true
  else
    echo "Notice: rclone remote '$REMOTE_NAME' is not configured yet."
    echo "Run 'rclone config' on the server to pair your Google Drive (15GB free tier)."
    echo "Local archive safely preserved at: $UPLOAD_TARGET"
  fi
else
  echo "Notice: rclone is not installed. Cloud upload skipped."
  echo "To enable 100% free offsite sync to Google Drive on VPS:"
  echo "  sudo apt install -y rclone && rclone config"
  echo "Local archive safely preserved at: $UPLOAD_TARGET"
fi

# Clean up local packaged upload file if cloud sync was successful and we still have the raw directory
if [ -f "$UPLOAD_TARGET" ] && [ -d "$LATEST_BACKUP" ]; then
  # Keep the single packaged archive for easy download/offsite retention, prune raw folder
  rm -rf "$LATEST_BACKUP" 2>/dev/null || true
fi

# Prune local daily-offsite archives older than RETENTION_DAYS
find "$BACKUP_ROOT" -maxdepth 1 -name "daily-offsite-*.tar.gz*" -mtime +"$RETENTION_DAYS" -exec rm -f {} + 2>/dev/null || true

echo "==> Offsite backup workflow completed successfully."

