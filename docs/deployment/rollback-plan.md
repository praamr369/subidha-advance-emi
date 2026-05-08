# Rollback Plan

## Trigger Conditions
- Production health checks fail after deploy.
- Critical role routes unavailable.
- Financial workflow regression detected.

## Rollback Sequence
1. Stop or isolate newly deployed services.
2. Restore previous backend/frontend artifact versions.
3. Restart services using previous stable build.
4. Verify health endpoints and role logins.

## Database Rollback Rules
- Restore database only if schema/data incompatibility requires it.
- Always restore from the latest verified pre-deploy backup.
- Preserve media/uploads; do not delete historical files.

## Post-Rollback Verification
- `/healthz/` and readiness endpoint pass.
- Admin, cashier, customer, partner routes load.
- Direct-sale, reversal, delivery history-only views behave correctly.
- Reconciliation pages load without regression.

## Safety Notes
- Do not run destructive reset operations on production.
- Keep audit/history visibility intact during rollback.
