# SUBIDHA ADVANCE EMI – Release Candidate Validation Guide

This guide defines the focused validation gate for a release candidate.

## Purpose

Use this validation path before:

- opening or updating a merge request
- marking a branch as release-candidate ready
- deploying to staging or production

The goal is to keep the gate practical and stable while covering the most important repo checks.

## 1. Backend validation

From the repository root:

```bash
cd backend
pip install -r requirements.txt
bash scripts/validate-release-candidate.sh
```

This runs:

```bash
python manage.py check
python manage.py check --deploy --settings core.settings.ci_deploy
python manage.py test \
  subscriptions.tests.FinancialFlowTests \
  subscriptions.tests.ReconcileFinancialsCommandTests \
  api.v1.tests.PaymentFlowIntegrationTests \
  api.v1.tests.Phase7BContractTests \
  ... file-backed patch-specific modules when present on the current branch
```

Stable baseline coverage:

- backend configuration importability
- deploy-mode Django validation under deterministic CI deploy settings
- financial flow integrity checks already in repo
- reconciliation command behavior already in repo
- API contract and admin workflow coverage already in repo

File-backed patch-specific backend modules are auto-included only when their files exist on the current branch.

Audited patch-specific discovery set:

- `api.v1.tests_health`
- `api.v1.tests_financial_truth`
- `api.v1.tests_payment_pagination`
- `api.v1.tests_subscription_schedule_rebuild`
- `api.v1.tests_batch_status`

### Deterministic backend DB strategy

The backend gate uses two explicit SQLite-backed settings paths:

- `python manage.py test ...` defaults to `core.settings.test`, which already uses in-memory SQLite
- `python manage.py check --deploy ...` now uses `core.settings.ci_deploy`, which imports the hardened base settings and then overrides the database to SQLite for deterministic CI and local validation

This removes the previous fake-Postgres dependency from the release-candidate gate.

## 2. Frontend validation

From the repository root:

```bash
cd frontend
bash scripts/validate-release-candidate.sh
```

This runs:

```bash
npm ci
npm run check:routes
npm run lint
npm run typecheck
npm run build
```

Coverage intent:

- route sanity
- type safety
- lint stability
- production build viability

The frontend validation path is unchanged.

## 3. CI workflow

GitHub Actions workflow:

- `.github/workflows/release-candidate-validation.yml`

It runs two focused jobs:

- backend release-candidate validation
- frontend release-candidate validation

The backend CI job sets:

- `DEPLOY_CHECK_SETTINGS_MODULE=core.settings.ci_deploy`

No external database service is required for the current validation gate.

## 4. Usage rule

A branch should not be treated as a release candidate unless:

- backend validation passes locally or in CI
- frontend validation passes locally or in CI
- the GitHub Actions workflow is green
- deployment smoke checks are still completed after deployment

## 5. Related operational docs

- `docs/deployment/OPERATIONS_RUNBOOK.md`
- `docs/deployment/RELEASE_SMOKE_CHECKLIST.md`
