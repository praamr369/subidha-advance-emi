#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

python manage.py check
python manage.py test \
  subscriptions.tests.FinancialFlowTests \
  subscriptions.tests.ReconcileFinancialsCommandTests \
  api.v1.tests.PaymentFlowIntegrationTests \
  api.v1.tests.Phase7BContractTests \
  api.v1.tests_health
