# Test Harness Repair Notes (Pass 7)

## Scope
- backend env reproducibility from repo root and backend directory
- Playwright preflight and smoke stability
- additive-only changes, no protected business posting logic changes

## Backend Environment Entry
- Supported from repo root:
  - `bash scripts/check-local-env.sh`
- Supported from backend directory:
  - `bash scripts/check-local-env.sh`

`backend/scripts/check-local-env.sh` now:
- verifies `python3` exists
- resolves venv python from `backend/.venv` or repo `.venv`
- validates Django import
- runs `python manage.py check`
- exits non-zero with explicit next commands on failure

## Playwright Harness
- Added preflight:
  - `npm run playwright:check`
- Added install alias:
  - `npm run playwright:install`
- `npx playwright test --list` no longer hard-fails when smoke metadata is missing.
- Smoke sqlite db default is per-process (`/tmp/subidha-playwright-smoke-<pid>.sqlite3`) to avoid cross-run collisions.
- Generated smoke metadata file is git-ignored:
  - `backend/playwright-smoke-meta.json`

## Validation Focus
- smoke setup remains responsible for deterministic seed + auth state generation
- vendor auth-state missing is an explicit skip path, not a silent pass
- no fake data added to production code paths
