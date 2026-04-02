#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${BACKEND_DIR}"

echo "[RC-BE] Backend directory: ${BACKEND_DIR}"

TEST_SETTINGS_MODULE="${TEST_SETTINGS_MODULE:-core.settings.test}"
DEPLOY_CHECK_SETTINGS_MODULE="${DEPLOY_CHECK_SETTINGS_MODULE:-core.settings.ci_deploy}"

BASE_TEST_MODULES=(
  "subscriptions.tests.FinancialFlowTests"
  "subscriptions.tests.ReconcileFinancialsCommandTests"
  "api.v1.tests.PaymentFlowIntegrationTests"
  "api.v1.tests.Phase7BContractTests"
)

PATCH_TEST_MODULES=()

append_if_exists() {
  local rel_path="$1"
  local module="$2"
  if [[ -f "${BACKEND_DIR}/${rel_path}" ]]; then
    PATCH_TEST_MODULES+=("${module}")
  fi
}

append_if_exists "api/v1/tests_health.py" "api.v1.tests_health"
append_if_exists "api/v1/tests_financial_truth.py" "api.v1.tests_financial_truth"
append_if_exists "api/v1/tests_payment_pagination.py" "api.v1.tests_payment_pagination"
append_if_exists "api/v1/tests_subscription_schedule_rebuild.py" "api.v1.tests_subscription_schedule_rebuild"
append_if_exists "api/v1/tests_batch_status.py" "api.v1.tests_batch_status"
append_if_exists "api/v1/tests_payment_method_contract.py" "api.v1.tests_payment_method_contract"
append_if_exists "api/v1/tests_register_pagination.py" "api.v1.tests_register_pagination"

ALL_TEST_MODULES=("${BASE_TEST_MODULES[@]}" "${PATCH_TEST_MODULES[@]}")

echo "[RC-BE] Running Django check with test settings..."
DJANGO_SETTINGS_MODULE="${TEST_SETTINGS_MODULE}" \
DJANGO_ENV=development \
DJANGO_DEBUG=true \
python manage.py check

echo "[RC-BE] Running backend test suite with test settings..."
DJANGO_SETTINGS_MODULE="${TEST_SETTINGS_MODULE}" \
DJANGO_ENV=development \
DJANGO_DEBUG=true \
python manage.py test "${ALL_TEST_MODULES[@]}"

echo "[RC-BE] Running deploy-mode Django check..."
DJANGO_SETTINGS_MODULE="${DEPLOY_CHECK_SETTINGS_MODULE}" \
python manage.py check --deploy --settings "${DEPLOY_CHECK_SETTINGS_MODULE}"

echo "[RC-BE] Backend release-candidate validation passed."