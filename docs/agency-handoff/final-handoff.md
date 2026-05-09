# Final Agency Handoff

## 1) Project Overview
SUBIDHA CORE is the Lucky Plan EMI production system for admin, cashier, customer, partner, and vendor-facing operations.

## 2) Stack
- Backend: Django + DRF + PostgreSQL + JWT
- Frontend: Next.js App Router + TypeScript + Tailwind
- Tests: Django tests + Playwright smoke + TypeScript/Lint checks

## 3) Non-Negotiable Business Rules
- Do not change EMI calculation/schedule behavior casually.
- Do not alter payment idempotency/reconciliation posting logic.
- Do not mutate historical financial/audit records destructively.
- Keep role boundaries strict (no admin control leakage to non-admin roles).

## 4) Direct-Sale Reversal/Archive Behavior
- Reversed/archived direct sales are non-collectible.
- Active outstanding views exclude reversed/returned sales.
- History, documents, and reversal case visibility remain available.

## 5) Delivery History-Only Behavior
- History-only/source-reversed delivery cases are read-only.
- Mutation actions are hidden or disabled in safe-read contexts.
- Audit/history context remains visible.

## 6) Dashboard KPI Visibility Rules
- Cancelled/reversed history does not pollute active operational KPIs.
- KPI and queue summaries remain role-safe and endpoint-backed.

## 7) Role Dashboard Boundaries
- Admin: full operational visibility.
- Cashier: collection-first, no admin-only controls.
- Customer/Partner: scoped operational data only.
- Vendor: real workspace where available, otherwise safe shell.

## 8) Notification/Sidebar/Mobile Behavior
- Notification bell supports desktop dropdown and mobile sheet.
- Mobile sidebar opens, supports search, and closes on navigation.
- Overlay/z-index layering prevents clipped action menus and unreachable controls.

## 9) Test Commands
```bash
cd backend
bash scripts/check-local-env.sh
source ../.venv/bin/activate && python3 manage.py check
source ../.venv/bin/activate && python3 manage.py makemigrations --check --dry-run
source ../.venv/bin/activate && python3 manage.py test tests.api.test_reversal_control_blockers tests.billing.test_reversal_service tests.api.test_reversal_center_api

cd ../frontend
npm run typecheck
npm run build:smoke
npm run lint
npx playwright test tests/e2e/ux_polish_smoke.spec.ts --project=chromium-smoke
npx playwright test tests/e2e/dashboard_smoke.spec.ts tests/e2e/reversal_center_smoke.spec.ts --project=chromium-smoke
```

## 10) Deployment Commands
- See `docs/deployment/pre-production-deployment-checklist.md`
- See `docs/deployment/vps-deployment-guide.md`
- See `docs/deployment/environment-variables.md`

## 11) Rollback Plan
- See `docs/deployment/rollback-plan.md`

## 12) Known Non-Blockers
- Vendor smoke local dependency:
  - if `frontend/tests/e2e/.auth/vendor.json` is missing, vendor suite skips explicitly with:
  - `vendor auth state missing; run auth setup or provide vendor.json`

## 13) Pre-Production Readiness
- Status: **READY WITH KNOWN NON-BLOCKERS**

## 14) Contact / Ownership (Fill by Ops)
- Product Owner: `<name>`
- Backend Owner: `<name>`
- Frontend Owner: `<name>`
- DevOps Owner: `<name>`
- QA Owner: `<name>`
