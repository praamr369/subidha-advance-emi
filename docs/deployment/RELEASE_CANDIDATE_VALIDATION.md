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
python manage.py check --deploy --settings core.settings.base
python manage.py test \
  subscriptions.tests.FinancialFlowTests \
  subscriptions.tests.ReconcileFinancialsCommandTests \
  api.v1.tests.PaymentFlowIntegrationTests \
  api.v1.tests.Phase7BContractTests \
  ... file-backed patch-specific modules when present on the current branch
```

Stable baseline coverage:

- backend configuration importability
- deploy-mode Django validation under production-like settings
- financial flow integrity checks already in repo
- reconciliation command behavior already in repo
- API contract and admin workflow coverage already in repo

File-backed patch-specific backend modules are auto-included only when their files exist on the current branch.

Current auto-discovery list:

- `api.v1.tests_health`
- `api.v1.tests_financial_truth`
- `api.v1.tests_payment_pagination`
- `api.v1.tests_subscription_schedule_rebuild`
- `api.v1.tests_batch_status`

### Deploy-mode validation env

The script supports local use and CI use.

In CI, the workflow sets explicit safe validation values for:

- `DJANGO_ENV=production`
- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DATABASE_URL`
- `DEPLOY_CHECK_SETTINGS_MODULE=core.settings.base`

For local runs, the script provides safe fallback defaults for the deploy check when those variables are not already set.

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

## 4. Usage rule

A branch should not be treated as a release candidate unless:

- backend validation passes locally or in CI
- frontend validation passes locally or in CI
- the GitHub Actions workflow is green
- deployment smoke checks are still completed after deployment

## 5. Related operational docs

- `docs/deployment/OPERATIONS_RUNBOOK.md`
- `docs/deployment/RELEASE_SMOKE_CHECKLIST.md`
