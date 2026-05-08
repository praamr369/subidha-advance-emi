# Release Validation Commands

## Backend
```bash
# repo root entrypoint
bash scripts/check-local-env.sh

# backend entrypoint
cd backend
bash scripts/check-local-env.sh
source ../.venv/bin/activate && python3 manage.py check
source ../.venv/bin/activate && python3 manage.py makemigrations --check --dry-run
source ../.venv/bin/activate && python3 manage.py showmigrations
source ../.venv/bin/activate && python3 manage.py migrate billing 0012
source ../.venv/bin/activate && python3 manage.py test tests.api.test_reversal_control_blockers tests.billing.test_reversal_service tests.api.test_reversal_center_api
source ../.venv/bin/activate && python3 manage.py test tests.api.test_permissions tests.api.test_admin_outstandings tests.api.test_public_stats tests.api.test_direct_sale_billing_workspace tests.api.test_partner tests.api.test_lucky_draw_public_trust tests.api.test_dashboard_navigation_badges
```

> Apply `billing 0012_alter_directsale_status` locally before manual testing so active-vs-history visibility tests run against the expected status choices.

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
npm run playwright:check
npx playwright install chromium
npx playwright test --list
npx playwright test tests/e2e/ux_polish_smoke.spec.ts --project=chromium-smoke
npx playwright test tests/e2e/dashboard_smoke.spec.ts tests/e2e/reversal_center_smoke.spec.ts --project=chromium-smoke
```

## Expected Local Non-Blocker
- Vendor smoke may be skipped when `frontend/tests/e2e/.auth/vendor.json` is missing.
- Expected message: `vendor auth state missing; run auth setup or provide vendor.json`.

## Route Alias Policy (Current)
- Canonical admin billing product search endpoint:
  - `/api/v1/admin/billing/products/search/`
- Backward-compatible deprecated alias retained temporarily:
  - `/api/v1/admin/billing/product-search/`
