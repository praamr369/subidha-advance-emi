# Backup and Restore Runbook

## Scope
- Covers database and media backups for SUBIDHA CORE production.
- Additive: does not alter business workflows or reconciliation behavior.

## Daily Backup Procedure
1. Verify application health (`/api/v1/health/deep/`).
2. Run database backup using operational Postgres tooling (`pg_dump`).
3. Archive media/storage path from `MEDIA_ROOT`.
4. Store artifacts under `BACKUP_ROOT` with timestamped folder names.
5. Record checksum and backup metadata (size, duration, operator).

## Restore Drill Procedure
1. Restore backup to a non-production validation environment.
2. Run `python manage.py check_production_readiness`.
3. Run smoke checks:
   - auth login
   - admin reports center load
   - finance/accounting control center read endpoints
4. Verify row counts for key tables (`subscriptions_payment`, `subscriptions_emi`, `accounting_journalentrygroup`).
5. Document drill outcome and issues.

## RPO and RTO Targets
- **RPO:** 24h maximum
- **RTO:** 4h target for partial outage, 8h for full recovery

## Escalation
- Escalate immediately if backup job fails twice consecutively.
- Open incident and follow `docs/incident-response.md`.
