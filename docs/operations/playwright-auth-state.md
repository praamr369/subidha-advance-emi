# Playwright Auth State Expectations

## Source of Truth
- Smoke setup project seeds deterministic data and writes storage states to:
  - `frontend/tests/e2e/.auth/admin.json`
  - `frontend/tests/e2e/.auth/cashier.json`
  - `frontend/tests/e2e/.auth/customer.json`
  - `frontend/tests/e2e/.auth/partner.json`
  - optional `frontend/tests/e2e/.auth/vendor.json`

## Behavior
- Role-scoped suites should fail fast when required auth is invalid.
- Vendor-only smoke may skip when vendor auth state is unavailable locally.
- Skips must carry explicit reason; no silent pass.
- Expected vendor skip message:
  - `vendor auth state missing; run auth setup or provide vendor.json`

## Regeneration
Run setup-backed smoke once:

```bash
cd frontend
npx playwright test tests/e2e/setup/auth.setup.ts --project=setup
```

Then run role suites.

Optional vendor setup (if vendor role login is available in your environment):

```bash
cd frontend
npx playwright test tests/e2e/setup/auth.setup.ts --project=setup
```

Verify vendor state path:

```bash
ls frontend/tests/e2e/.auth/vendor.json
```

## Security
- Never commit real credentials.
- Keep auth state test-only and generated in local/CI runtime.
- Never commit:
  - `frontend/tests/e2e/.auth/*.json`
  - `frontend/tests/e2e/.generated/smoke-manifest.json` when it includes environment-specific tokens.
