# Release Validation Commands

## Backend
```bash
cd backend
bash scripts/check-local-env.sh
source ../.venv/bin/activate && python3 manage.py check
source ../.venv/bin/activate && python3 manage.py makemigrations --check --dry-run
source ../.venv/bin/activate && python3 manage.py test tests.api.test_reversal_control_blockers tests.billing.test_reversal_service tests.api.test_reversal_center_api
```

## Frontend
```bash
cd frontend
npm run typecheck
npm run build:smoke
npm run lint
```

## Playwright Smoke
```bash
cd frontend
npx playwright test tests/e2e/ux_polish_smoke.spec.ts --project=chromium-smoke
npx playwright test tests/e2e/dashboard_smoke.spec.ts tests/e2e/reversal_center_smoke.spec.ts --project=chromium-smoke
```

## Expected Local Non-Blocker
- Vendor smoke may be skipped when `frontend/tests/e2e/.auth/vendor.json` is missing.
- Expected message: `vendor auth state missing; run auth setup or provide vendor.json`.
