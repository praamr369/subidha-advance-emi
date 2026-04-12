#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

# Optional: source an untracked local/server env file
# Example:
#   SUBIDHA_RESET_ENV_FILE=/etc/subidha-core/reset-live-state.env ./scripts/reset_live_business_state.sh --dry-run
if [[ -n "${SUBIDHA_RESET_ENV_FILE:-}" && -f "${SUBIDHA_RESET_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${SUBIDHA_RESET_ENV_FILE}"
  set +a
fi

PYTHON_BIN="${SUBIDHA_PYTHON_BIN:-../.venv/bin/python}"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python"
fi

"${PYTHON_BIN}" manage.py reset_live_business_state \
  --delete-non-kept-users \
  --clear-auth-artifacts \
  --admin-user-id "${SUBIDHA_ADMIN_USER_ID}" \
  --admin-username "${SUBIDHA_ADMIN_USERNAME}" \
  --admin-email "${SUBIDHA_ADMIN_EMAIL}" \
  --admin-phone "${SUBIDHA_ADMIN_PHONE}" \
  --admin-password-env SUBIDHA_ADMIN_PASSWORD \
  --ensure-cash-account \
  --cash-account-name "${SUBIDHA_CASH_ACCOUNT_NAME:-Cash in Hand}" \
  --ensure-bank-account \
  --bank-account-name "${SUBIDHA_BANK_ACCOUNT_NAME:-Main Bank}" \
  --bank-last4-env SUBIDHA_BANK_LAST4 \
  --ensure-upi-account \
  --upi-account-name "${SUBIDHA_UPI_ACCOUNT_NAME:-Main UPI}" \
  --upi-handle-env SUBIDHA_UPI_HANDLE \
  --confirm RESET_SUBIDHA_CORE \
  "$@"