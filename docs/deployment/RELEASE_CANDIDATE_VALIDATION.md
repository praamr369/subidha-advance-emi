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
python manage.py test \
  subscriptions.tests.FinancialFlowTests \
  subscriptions.tests.ReconcileFinancialsCommandTests \
  api.v1.tests.PaymentFlowIntegrationTests \
  api.v1.tests.Phase7BContractTests \
  api.v1.tests_health
```

Coverage intent:

- backend configuration importability
- financial flow integrity checks
- reconciliation command behavior
- API contract and admin workflow coverage already present in repo
- health and readiness endpoint behavior

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
