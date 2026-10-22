#!/usr/bin/env bash
# Weekly Database Maintenance & Health Script
# Optimizes PostgreSQL query planner statistics and reindexes append-only financial tables.
#
# Usage:
#   ./db-maintenance.sh
#
# Recommended cron (run weekly on off-peak hours, e.g. Sunday 3:30 AM after backup):
#   30 3 * * 0 /var/www/subidha/app/scripts/server/db-maintenance.sh >> /var/log/subidha-db-maintenance.log 2>&1
set -euo pipefail

DB_NAME="${DB_NAME:-subidha}"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

echo "=========================================================="
echo "==> [$STAMP] Starting PostgreSQL maintenance on '$DB_NAME'..."
echo "=========================================================="

# 1. Non-blocking VACUUM ANALYZE updates planner cost estimates and frees dead row pointers
echo "==> [1/3] Running VACUUM ANALYZE..."
sudo -u postgres psql -d "$DB_NAME" -c "VACUUM (ANALYZE, VERBOSE);"

# 2. Reindex critical high-growth tables to rebuild B-Tree indexes without bloat
echo "==> [2/3] Reindexing high-traffic operational tables..."
for table in financial_ledgers emis payments billing_invoices receipt_documents subscriptions crm_parties audit_logs; do
  if sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='$table'" | grep -q 1; then
    echo "    Reindexing table: $table"
    sudo -u postgres psql -d "$DB_NAME" -c "REINDEX TABLE $table;"
  fi
done

# 3. Report database size and top 5 tables
echo "==> [3/3] Database storage footprint:"
sudo -u postgres psql -d "$DB_NAME" -c "
SELECT
    pg_size_pretty(pg_database_size('$DB_NAME')) AS total_db_size;
"
sudo -u postgres psql -d "$DB_NAME" -c "
SELECT
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 5;
"

echo "=========================================================="
echo "==> Database maintenance completed successfully at $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================================="

