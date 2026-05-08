# Pre-Production Deployment Checklist

## 1) Change Control
- Confirm target branch/tag and release window.
- Confirm no pending schema drift: `python3 manage.py makemigrations --check --dry-run`.
- Confirm no blocked incidents or unresolved financial reconciliation issues.

## 2) Backup Before Deploy
- Take PostgreSQL backup before migrations.
- Verify backup file integrity and restore command.
- Confirm backup path/retention from `docs/deployment/backup-restore-runbook.md`.

## 3) Backend Deploy Steps
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 manage.py check
python3 manage.py migrate
python3 manage.py collectstatic --noinput
```

- Preserve existing superuser/admin account.
- Do not run any reset command on production.

## 4) Frontend Deploy Steps
```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

- Ensure `NEXT_PUBLIC_API_BASE_URL` includes `/api/v1`.
- Start frontend via process manager (systemd/pm2/platform runtime).

## 5) Post-Deploy Validation
- Backend health endpoint returns 200.
- Frontend login page loads.
- Role routes load: admin, cashier, customer, partner.
- Vendor route loads (workspace or safe shell message).

## 6) Mandatory Command Validation
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

## 7) Manual Business Smoke Checklist
- Admin login works.
- Cashier login works.
- Customer login works.
- Partner login works.
- Vendor route works (or safe shell shown).
- Create direct sale.
- Invoice and receipt are visible.
- Reverse/return direct sale from allowed flow.
- Confirm reversed/archived sale has no collect/payment action.
- Confirm reversed sale is excluded from active outstanding.
- Confirm delivery case shows history-only where expected.
- Confirm dashboard KPI remains operationally correct (no cancelled/reversed pollution).
- Confirm documents/history remain visible for audit.
- Collect Advance EMI and verify receipt.
- Verify reconciliation surfaces load and operate.
- Verify lucky draw pages load.
- Verify public pages load.

## 8) Known Non-Blockers
- Vendor smoke may skip locally when `frontend/tests/e2e/.auth/vendor.json` is missing.
- Expected explicit skip message: `vendor auth state missing; run auth setup or provide vendor.json`.
