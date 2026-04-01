#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

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

append_test_target_if_present "api/v1/tests_health.py" "api.v1.tests_health"
append_test_target_if_present "api/v1/tests_financial_truth.py" "api.v1.tests_financial_truth"
append_test_target_if_present "api/v1/tests_payment_pagination.py" "api.v1.tests_payment_pagination"
append_test_target_if_present "api/v1/tests_subscription_schedule_rebuild.py" "api.v1.tests_subscription_schedule_rebuild"
append_test_target_if_present "api/v1/tests_batch_status.py" "api.v1.tests_batch_status"

ensure_deploy_validation_env() {
  export DJANGO_ENV="${DJANGO_ENV:-production}"
  export DJANGO_DEBUG="${DJANGO_DEBUG:-false}"
  export DJANGO_SECRET_KEY="${DJANGO_SECRET_KEY:-ci-only-deploy-validation-secret-key}"
  export DJANGO_ALLOWED_HOSTS="${DJANGO_ALLOWED_HOSTS:-ci.subidha.local,localhost,127.0.0.1}"
  export DATABASE_URL="${DATABASE_URL:-postgresql://subidha_ci:subidha_ci@127.0.0.1:5432/subidha_ci}"
  export DEPLOY_CHECK_SETTINGS_MODULE="${DEPLOY_CHECK_SETTINGS_MODULE:-core.settings.base}"
}

python manage.py check

ensure_deploy_validation_env
python manage.py check --deploy --settings "$DEPLOY_CHECK_SETTINGS_MODULE"

printf 'Running backend release-candidate tests:\n'
printf ' - %s\n' "${test_targets[@]}"
python manage.py test "${test_targets[@]}"
