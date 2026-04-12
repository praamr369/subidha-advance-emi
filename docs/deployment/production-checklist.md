# Production Checklist

See [PRODUCTION_HANDOFF.md](./PRODUCTION_HANDOFF.md) for the exact environment contract, startup commands, migration sequence, and post-deploy smoke steps.

## Backend
- environment variables configured
- production secrets loaded from secret manager or ops-managed env file
- debug disabled
- strong `DJANGO_SECRET_KEY` configured
- `JWT_SIGNING_KEY` configured or intentionally inherited from the production Django secret
- PostgreSQL configured
- migrations applied
- static handling configured
- CORS and allowed hosts verified

## Frontend
- production API URL configured
- build passes
- login flow tested
- role routing tested

## Business verification
- product creation works
- batch creation works
- subscription creation works
- EMI schedule generation works
- payment collection works
- winner flow works
- reports load correctly

## Final handoff references
- `docs/operations/go-live-checklist.md`
- `docs/operations/migration-rehearsal-checklist.md`
- `docs/operations/first-week-operations-checklist.md`
- `docs/operations/cashier-counter-opening-closing.md`
- `docs/operations/branch-day-close-checklist.md`
- `docs/operations/uat-checklist.md`
- `docs/deployment/rollback-incident-handling.md`
