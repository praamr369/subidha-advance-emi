#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -x ".venv/bin/python" ]]; then
    PYTHON_BIN="$(pwd)/.venv/bin/python"
  elif [[ -x "../.venv/bin/python" ]]; then
    PYTHON_BIN="$(cd .. && pwd)/.venv/bin/python"
  elif [[ -x "../../.venv/bin/python" ]]; then
    PYTHON_BIN="$(cd ../.. && pwd)/.venv/bin/python"
  elif [[ -x "/home/subidha-furniture/subidha-lucky-plan/.venv/bin/python" ]]; then
    PYTHON_BIN="/home/subidha-furniture/subidha-lucky-plan/.venv/bin/python"
  fi
fi

if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python)"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  else
    echo "No python interpreter found on PATH." >&2
    exit 1
  fi
fi

CHECK_SETTINGS_MODULE="${CHECK_SETTINGS_MODULE:-core.settings.test}"
DEPLOY_CHECK_SETTINGS_MODULE="${DEPLOY_CHECK_SETTINGS_MODULE:-core.settings.production}"
DEPLOY_CHECK_DJANGO_ENV="${DEPLOY_CHECK_DJANGO_ENV:-production}"
DEPLOY_CHECK_SECRET_KEY="${DEPLOY_CHECK_SECRET_KEY:-release-candidate-deploy-check-secret-key-2026-rotate-before-production-a7m4q2x9}"
DEPLOY_CHECK_ALLOWED_HOSTS="${DEPLOY_CHECK_ALLOWED_HOSTS:-localhost}"
DEPLOY_CHECK_DATABASE_URL="${DEPLOY_CHECK_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/subidha_rc}"
DEPLOY_CHECK_CSRF_TRUSTED_ORIGINS="${DEPLOY_CHECK_CSRF_TRUSTED_ORIGINS:-http://localhost}"
TEST_CHECK_DJANGO_ENV="${TEST_CHECK_DJANGO_ENV:-development}"
TEST_CHECK_ALLOWED_HOSTS="${TEST_CHECK_ALLOWED_HOSTS:-localhost,127.0.0.1}"
TEST_CHECK_CSRF_TRUSTED_ORIGINS="${TEST_CHECK_CSRF_TRUSTED_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000}"

test_targets=(
  "subscriptions.tests.FinancialFlowTests"
  "subscriptions.tests.ReconcileFinancialsCommandTests"
  "api.v1.tests.PaymentFlowIntegrationTests"
  "api.v1.tests.Phase7BContractTests"
)

append_test_target_if_present() {
  local relative_path="$1"
  local module="$2"

  if [[ -f "$relative_path" ]]; then
    test_targets+=("$module")
  fi
}

# Audited patch-specific backend test modules present across the integrated hardening branches.
append_test_target_if_present "api/v1/tests_health.py" "api.v1.tests_health"
append_test_target_if_present "api/v1/tests_financial_truth.py" "api.v1.tests_financial_truth"
append_test_target_if_present "api/v1/tests_payment_pagination.py" "api.v1.tests_payment_pagination"
append_test_target_if_present "api/v1/tests_subscription_schedule_rebuild.py" "api.v1.tests_subscription_schedule_rebuild"
append_test_target_if_present "api/v1/tests_batch_status.py" "api.v1.tests_batch_status"

DJANGO_ENV="$TEST_CHECK_DJANGO_ENV" \
DJANGO_ALLOWED_HOSTS="$TEST_CHECK_ALLOWED_HOSTS" \
CSRF_TRUSTED_ORIGINS="$TEST_CHECK_CSRF_TRUSTED_ORIGINS" \
  "$PYTHON_BIN" manage.py check --settings "$CHECK_SETTINGS_MODULE"

DJANGO_ENV="$DEPLOY_CHECK_DJANGO_ENV" \
DJANGO_SECRET_KEY="$DEPLOY_CHECK_SECRET_KEY" \
DJANGO_ALLOWED_HOSTS="$DEPLOY_CHECK_ALLOWED_HOSTS" \
CSRF_TRUSTED_ORIGINS="$DEPLOY_CHECK_CSRF_TRUSTED_ORIGINS" \
DATABASE_URL="$DEPLOY_CHECK_DATABASE_URL" \
  "$PYTHON_BIN" manage.py check --deploy --settings "$DEPLOY_CHECK_SETTINGS_MODULE"

printf 'Running backend release-candidate tests:\n'
printf ' - %s\n' "${test_targets[@]}"
DJANGO_ENV="$TEST_CHECK_DJANGO_ENV" \
DJANGO_ALLOWED_HOSTS="$TEST_CHECK_ALLOWED_HOSTS" \
CSRF_TRUSTED_ORIGINS="$TEST_CHECK_CSRF_TRUSTED_ORIGINS" \
  "$PYTHON_BIN" manage.py test --settings "$CHECK_SETTINGS_MODULE" "${test_targets[@]}"
