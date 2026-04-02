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

# Audited patch-specific backend test modules present across the integrated hardening branches.
append_test_target_if_present "api/v1/tests_health.py" "api.v1.tests_health"
append_test_target_if_present "api/v1/tests_financial_truth.py" "api.v1.tests_financial_truth"
append_test_target_if_present "api/v1/tests_payment_pagination.py" "api.v1.tests_payment_pagination"
append_test_target_if_present "api/v1/tests_subscription_schedule_rebuild.py" "api.v1.tests_subscription_schedule_rebuild"
append_test_target_if_present "api/v1/tests_batch_status.py" "api.v1.tests_batch_status"

python manage.py check

DEPLOY_CHECK_SETTINGS_MODULE="${DEPLOY_CHECK_SETTINGS_MODULE:-core.settings.ci_deploy}"
python manage.py check --deploy --settings "$DEPLOY_CHECK_SETTINGS_MODULE"

printf 'Running backend release-candidate tests:\n'
printf ' - %s\n' "${test_targets[@]}"
python manage.py test "${test_targets[@]}"
