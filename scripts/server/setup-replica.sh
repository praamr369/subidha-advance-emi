#!/usr/bin/env bash
#
# Provision a streaming read replica of the Subidha PostgreSQL cluster.
#
#   ./scripts/server/setup-replica.sh          # create + start the standby
#   ./scripts/server/setup-replica.sh --status # replication health
#   ./scripts/server/setup-replica.sh --enable # add DB_REPLICA_* to backend.env
#
# WHAT THIS BUYS, AND WHAT IT DOES NOT
#
# On the same host the standby shares disk and CPU with the primary. That gives
# read *isolation* — a long ledger export no longer competes for the primary's
# locks and buffers — but not read *capacity*, because the same spindles and
# cores serve both. Moving the standby to its own host is what buys capacity.
#
# Nothing routes to the replica automatically. core/db_routers.ReplicaRouter
# keeps writes and migrations off it, and reporting call sites opt in with
# .using(settings.REPLICA_DATABASE_ALIAS). That is deliberate: replication lag
# is unbounded under load, and a trial balance assembled from a lagging standby
# reports a combination of figures that never existed together while looking
# entirely plausible.
set -euo pipefail

PG_VERSION="${PG_VERSION:-16}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPLICA_PORT="${REPLICA_PORT:-5433}"
REPLICA_CLUSTER="${REPLICA_CLUSTER:-replica}"
REPLICA_DATA="/var/lib/postgresql/$PG_VERSION/$REPLICA_CLUSTER"
REPL_USER="${REPL_USER:-subidha_repl}"
SLOT_NAME="${SLOT_NAME:-subidha_replica_slot}"
BACKEND_ENV="${BACKEND_ENV:-/etc/subidha/backend.env}"

die() { echo "!!! $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ $EUID -eq 0 ]] || die "run as root (sudo)."

# ------------------------------------------------------------------ status ---
if [[ "${1:-}" == "--status" ]]; then
  note "Primary — replication clients and slots"
  sudo -u postgres psql -p "$PRIMARY_PORT" -x -c \
    "select client_addr, state, sync_state,
            pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) as replay_behind
       from pg_stat_replication"
  sudo -u postgres psql -p "$PRIMARY_PORT" -c \
    "select slot_name, active,
            pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retained_wal
       from pg_replication_slots"
  note "Standby — recovery state and lag"
  sudo -u postgres psql -p "$REPLICA_PORT" -tAc \
    "select 'in_recovery=' || pg_is_in_recovery(),
            'lag_seconds=' || coalesce(extract(epoch from now() - pg_last_xact_replay_timestamp())::int, 0)"
  exit 0
fi

# ------------------------------------------------------------------ enable ---
if [[ "${1:-}" == "--enable" ]]; then
  [[ -f "$BACKEND_ENV" ]] || die "$BACKEND_ENV not found."
  sudo -u postgres psql -p "$REPLICA_PORT" -tAc 'select 1' >/dev/null 2>&1 \
    || die "Standby on port $REPLICA_PORT is not answering. Run --status first."
  cp -a "$BACKEND_ENV" "$BACKEND_ENV.bak-$(date +%Y%m%d-%H%M%S)"
  grep -qE '^DB_REPLICA_HOST=' "$BACKEND_ENV" || echo "DB_REPLICA_HOST=127.0.0.1" >> "$BACKEND_ENV"
  grep -qE '^DB_REPLICA_PORT=' "$BACKEND_ENV" || echo "DB_REPLICA_PORT=$REPLICA_PORT" >> "$BACKEND_ENV"
  note "DB_REPLICA_HOST/PORT added. Restart the app to pick them up:"
  echo "    systemctl restart subidha-gunicorn"
  note "Django will then expose settings.REPLICA_DATABASE_ALIAS == 'replica'."
  exit 0
fi

# ---------------------------------------------------------------- provision ---
command -v pg_createcluster >/dev/null 2>&1 || die "pg_createcluster not found (Debian/Ubuntu only)."

# Refuse to clobber a standby that holds data. An empty directory is the
# residue of a failed earlier attempt and is safe to reuse — distinguishing the
# two matters, because the destructive rm below runs either way.
if [[ -d "$REPLICA_DATA" ]] && [[ -n "$(ls -A "$REPLICA_DATA" 2>/dev/null)" ]]; then
  die "$REPLICA_DATA exists and is not empty — refusing to overwrite. Remove the cluster first: pg_dropcluster $PG_VERSION $REPLICA_CLUSTER"
fi

note "[1/6] Ensuring a replication role and slot on the primary"
# NOLOGIN would block streaming; REPLICATION is the only extra privilege needed,
# and it cannot read table data on its own.
sudo -u postgres psql -p "$PRIMARY_PORT" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$REPL_USER') THEN
    CREATE ROLE $REPL_USER WITH REPLICATION LOGIN PASSWORD NULL;
  END IF;
END
\$\$;
SELECT pg_create_physical_replication_slot('$SLOT_NAME')
 WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = '$SLOT_NAME');
SQL

note "[2/6] Allowing local replication connections"
HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"
IDENT="/etc/postgresql/$PG_VERSION/main/pg_ident.conf"
MAP_NAME="subidha_repl_map"

# pg_basebackup runs as OS user "postgres" but must authenticate as the
# dedicated replication role. Plain peer auth maps OS name to DB name and so
# rejects that. An ident map lets postgres act as $REPL_USER without loosening
# anything to trust and without falling back to the superuser for streaming.
if ! grep -qE "^${MAP_NAME}\s+postgres\s+${REPL_USER}" "$IDENT"; then
  cp -a "$IDENT" "$IDENT.bak-$(date +%Y%m%d-%H%M%S)"
  echo "$MAP_NAME   postgres   $REPL_USER" >> "$IDENT"
  note "      pg_ident.conf map added (backup kept)"
fi

# pg_hba is FIRST MATCH WINS. Debian ships "local replication all peer" near
# the top, which matches this connection before any appended line is reached —
# so the mapped rule must be inserted ABOVE it, not added at the end.
cp -a "$HBA" "$HBA.bak-$(date +%Y%m%d-%H%M%S)"
# Drop any previous attempt at this rule, wherever it landed.
sed -i -E "/^local[[:space:]]+replication[[:space:]]+${REPL_USER}[[:space:]]/d" "$HBA"

MAPPED_RULE="local   replication     $REPL_USER                              peer map=$MAP_NAME"
FIRST_REPL_LINE="$(grep -nE '^local[[:space:]]+replication' "$HBA" | head -1 | cut -d: -f1 || true)"
if [[ -n "$FIRST_REPL_LINE" ]]; then
  sed -i "${FIRST_REPL_LINE}i ${MAPPED_RULE}" "$HBA"
  note "      pg_hba.conf rule inserted above the existing replication rule (line $FIRST_REPL_LINE)"
else
  echo "$MAPPED_RULE" >> "$HBA"
  note "      pg_hba.conf rule appended (no existing replication rule)"
fi
systemctl reload "postgresql@$PG_VERSION-main"

note "[3/6] Creating the standby cluster (this copies the whole database)"
if ! pg_lsclusters -h 2>/dev/null | awk '{print $1" "$2}' | grep -qx "$PG_VERSION $REPLICA_CLUSTER"; then
  pg_createcluster "$PG_VERSION" "$REPLICA_CLUSTER" --port="$REPLICA_PORT" --start-conf=manual >/dev/null
else
  note "      cluster $PG_VERSION/$REPLICA_CLUSTER already exists — reusing it"
fi
rm -rf "${REPLICA_DATA:?}/"*
sudo -u postgres pg_basebackup \
  --pgdata="$REPLICA_DATA" \
  --host=/var/run/postgresql --port="$PRIMARY_PORT" --username="$REPL_USER" \
  --wal-method=stream --slot="$SLOT_NAME" \
  --write-recovery-conf --checkpoint=fast --progress

note "[4/6] Marking the cluster read-only"
CONF="/etc/postgresql/$PG_VERSION/$REPLICA_CLUSTER/postgresql.conf"
{
  echo ""
  echo "# Subidha standby — managed by scripts/server/setup-replica.sh"
  echo "hot_standby = on"
  # Reporting queries are long; without this, replay conflicts cancel them.
  echo "max_standby_streaming_delay = 300s"
  echo "hot_standby_feedback = on"
} >> "$CONF"

note "[5/6] Starting the standby"
pg_ctlcluster "$PG_VERSION" "$REPLICA_CLUSTER" start
sleep 3
sudo -u postgres psql -p "$REPLICA_PORT" -tAc 'select pg_is_in_recovery()' | grep -q t \
  || die "Standby started but is not in recovery — it is not replicating."

note "[6/6] Verifying replication"
"$0" --status

cat <<EOF

Standby is live on port $REPLICA_PORT and replicating.

The application is NOT using it yet. To point reporting at it:
    $0 --enable
    systemctl restart subidha-gunicorn

Then reporting call sites can opt in:
    Model.objects.using(settings.REPLICA_DATABASE_ALIAS).filter(...)

Remember: hot_standby_feedback=on means long reporting queries on the standby
hold back vacuum on the PRIMARY. Watch for table bloat if reports run for hours.
EOF
