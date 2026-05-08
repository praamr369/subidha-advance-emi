# Pre-Production UI Readiness

## Scope
Final release hardening for dashboard UX, reversal/read-only behavior, role-safe navigation, and smoke reliability.

## Current Test Status
- Backend safety checks and targeted reversal tests pass under activated venv.
- Frontend `typecheck` and `build:smoke` pass.
- Playwright smoke:
  - `ux_polish_smoke` passes with explicit vendor skip when vendor auth state is unavailable.
  - `dashboard_smoke` and `reversal_center_smoke` pass.

## Known Lint State
- Run:
  - `cd frontend && npm run lint`
- Lint is strict (`max-warnings=0`) and currently passing.
- Status details are tracked in `docs/operations/frontend-lint-debt.md`.

## Vendor Auth-State Behavior
- Storage states live in `frontend/tests/e2e/.auth/`.
- Vendor suite behavior:
  - run when `vendor.json` exists
  - otherwise skip with:
    - `vendor auth state missing; run auth setup or provide vendor.json`
- Do not commit `.auth/*.json` or token-bearing generated manifests.

## Mobile UI Guarantees
- No body-level horizontal overflow on key operational pages at 390px.
- Mobile sidebar opens, shows search, keeps role-safe links, and closes after navigation.
- Notification bell works on desktop dropdown and mobile sheet.
- Action menus/popovers stay usable above content surfaces.

## Direct-Sale Reversed/Archived Guarantees
- Reversed/archived direct-sale rows are treated as history-only.
- Collection/payment gateway actions are hidden or blocked for non-collectible states.
- History/document/reversal navigation remains visible for auditability.

## Delivery History-Only Guarantees
- Delivery manage views show source-reversed/history-only badges.
- Mutation actions are removed or disabled for history-only/safe-read states.
- Historical context and traceability remain visible.

## Policy Confirmation
- No fake dashboard/notification/vendor data in production paths.
- Protected financial and posting logic remains unchanged.
- Historical records are not deleted.

## Handoff Commands
```bash
# backend
cd backend
bash scripts/check-local-env.sh
source ../.venv/bin/activate && python3 manage.py check
source ../.venv/bin/activate && python3 manage.py makemigrations --check --dry-run
source ../.venv/bin/activate && python3 manage.py test tests.api.test_reversal_control_blockers tests.billing.test_reversal_service tests.api.test_reversal_center_api

# frontend
cd ../frontend
npm run typecheck
npm run build:smoke
npm run lint
npx playwright test tests/e2e/ux_polish_smoke.spec.ts --project=chromium-smoke
npx playwright test tests/e2e/dashboard_smoke.spec.ts tests/e2e/reversal_center_smoke.spec.ts --project=chromium-smoke
```
