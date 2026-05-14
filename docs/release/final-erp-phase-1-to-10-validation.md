# Final ERP Phase 1-10 Validation

This checklist is for release-candidate validation on update branches before any merge to `main`.

## Required command set
Run from repo root:

```bash
cd backend && ../.venv/bin/python manage.py makemigrations --check --dry-run
cd backend && ../.venv/bin/python manage.py test tests.api
cd backend && ../.venv/bin/python manage.py test
cd frontend && npm run lint
cd frontend && npm run typecheck
cd frontend && npm run build
bash scripts/run-release-candidate.sh
```

## Phase 10 specific checks (current code)
- Rent/lease contract create + profile persistence.
- Deposit demand/collection/deduction/refund audit trails.
- Rent/lease unified collection remains non-posting with explicit disabled reason.
- Direct-sale creation blocked for products in active rent/lease possession.
- Return inspection approve path closes possession and routes inventory outcome.

## Compatibility checks
- Lucky Plan EMI creation, posting, waiver behavior unchanged.
- Direct sale billing and receipt flows unchanged except new possession safety block.
- Existing accounting setup/readiness endpoints unchanged.
- Inventory stock ledger and delivery/reversal flows unchanged.
