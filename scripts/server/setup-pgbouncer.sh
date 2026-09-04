#!/usr/bin/env bash
#
# Install and verify PgBouncer for Subidha ERP, then optionally cut the app over.
#
#   ./scripts/server/setup-pgbouncer.sh            # install + verify, app untouched
#   ./scripts/server/setup-pgbouncer.sh --cutover  # the above, then point the app at it
#   ./scripts/server/setup-pgbouncer.sh --rollback # point the app back at PostgreSQL
#
# Install and cutover are separate on purpose: after the first form, PgBouncer is
# running and proven to serve queries while production still talks directly to
# PostgreSQL. Nothing about the running site has changed, so there is no hurry
# and no risk in stopping there.
#
# Read scripts/server/pgbouncer.ini before changing pool_mode. Session pooling is
# a requirement here, not a default.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/subidha/app}"
BACKEND_ENV="${BACKEND_ENV:-/etc/subidha/backend.env}"
PGB_DIR="/etc/pgbouncer"
PGB_PORT=6432
DIRECT_PORT=5432
SERVICES="subidha-gunicorn subidha-celery subidha-celery-beat"

die() { echo "!!! $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ $EUID -eq 0 ]] || die "run as root (sudo)."
[[ -f "$BACKEND_ENV" ]] || die "$BACKEND_ENV not found."

backup_env() {
  local stamp; stamp="$(date +%Y%m%d-%H%M%S)"
  cp -a "$BACKEND_ENV" "$BACKEND_ENV.bak-$stamp"
  note "env backed up: $BACKEND_ENV.bak-$stamp"
}

current_port() {
  grep -E '^DB_PORT=' "$BACKEND_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' '
}

set_port() {
  local target="$1"
  backup_env
  if grep -qE '^DB_PORT=' "$BACKEND_ENV"; then
    sed -i -E "s|^DB_PORT=.*|DB_PORT=$target|" "$BACKEND_ENV"
  else
    echo "DB_PORT=$target" >> "$BACKEND_ENV"
  fi
  note "DB_PORT set to $target"
}

restart_app() {
  for unit in $SERVICES; do
    if systemctl list-unit-files "$unit.service" --no-legend 2>/dev/null | grep -q .; then
      systemctl restart "$unit" && note "restarted $unit"
    fi
  done
}

health_ok() {
  curl -fsSk "${HEALTH_URL:-http://127.0.0.1:8000/api/v1/health/deep/}" >/dev/null 2>&1
}

# ---------------------------------------------------------------- rollback ---
if [[ "${1:-}" == "--rollback" ]]; then
  note "Pointing the application back at PostgreSQL directly (port $DIRECT_PORT)"
  set_port "$DIRECT_PORT"
  restart_app
  sleep 5
  health_ok && note "Health check OK — rolled back." || die "Health check FAILED after rollback."
  exit 0
fi

# ----------------------------------------------------------------- install ---
command -v pgbouncer >/dev/null 2>&1 \
  || die "pgbouncer is not installed. Run: apt-get install -y pgbouncer"

note "[1/5] Writing $PGB_DIR/pgbouncer.ini"
install -o postgres -g postgres -m 640 "$APP_DIR/scripts/server/pgbouncer.ini" "$PGB_DIR/pgbouncer.ini"

note "[2/5] Generating $PGB_DIR/userlist.txt from $BACKEND_ENV"
# The password is read and written without ever being printed. PgBouncer needs
# the plaintext to authenticate OUTWARD to PostgreSQL under scram-sha-256 — a
# stored verifier is enough to check a client but not to log in as one. The file
# is therefore a second copy of the credential and is locked down accordingly.
DB_USER="$(grep -E '^DB_USER=' "$BACKEND_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
[[ -n "$DB_USER" ]] || die "DB_USER not found in $BACKEND_ENV"
(
  umask 077
  {
    printf '"%s" "' "$DB_USER"
    grep -E '^DB_PASSWORD=' "$BACKEND_ENV" | head -1 | cut -d= -f2- \
      | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' | tr -d '\n'
    printf '"\n'
  } > "$PGB_DIR/userlist.txt"
)
chown postgres:postgres "$PGB_DIR/userlist.txt"
chmod 600 "$PGB_DIR/userlist.txt"
grep -q "\"$DB_USER\"" "$PGB_DIR/userlist.txt" || die "userlist.txt was not written correctly."
note "      userlist.txt written (contents not displayed)"

note "[3/5] Starting pgbouncer"
systemctl enable pgbouncer >/dev/null 2>&1 || true
systemctl restart pgbouncer
sleep 2
systemctl is-active --quiet pgbouncer || {
  journalctl -u pgbouncer -n 20 --no-pager
  die "pgbouncer failed to start."
}

note "[4/5] Verifying a real query through port $PGB_PORT"
set -a; . "$BACKEND_ENV"; set +a
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PGB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -tAc 'select 1' >/dev/null || {
    journalctl -u pgbouncer -n 20 --no-pager
    die "Could not query through pgbouncer. The application was NOT touched."
  }
note "      query through pgbouncer succeeded"

if [[ "${1:-}" != "--cutover" ]]; then
  note "[5/5] Install complete. The application still connects directly (port $(current_port))."
  echo
  echo "    PgBouncer is running and proven. To move the app onto it:"
  echo "      $0 --cutover"
  echo "    To undo later:"
  echo "      $0 --rollback"
  exit 0
fi

note "[5/5] Cutting the application over to port $PGB_PORT"
PREVIOUS_PORT="$(current_port)"
set_port "$PGB_PORT"
restart_app
sleep 5

if health_ok; then
  note "Health check OK. Live on PgBouncer."
  echo "    Rollback if anything looks wrong: $0 --rollback"
else
  echo "!!! Health check FAILED — rolling back automatically." >&2
  set_port "${PREVIOUS_PORT:-$DIRECT_PORT}"
  restart_app
  sleep 5
  health_ok && die "Rolled back to direct connection; site healthy. Investigate before retrying." \
             || die "Rollback did not restore health. Check: journalctl -u subidha-gunicorn -n 50"
fi
