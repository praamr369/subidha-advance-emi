#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_SCRIPT="${REPO_ROOT}/backend/scripts/check-local-env.sh"

if [[ ! -f "${BACKEND_SCRIPT}" ]]; then
  echo "[env-check] missing backend helper: ${BACKEND_SCRIPT}"
  exit 1
fi

echo "[env-check] repo root: ${REPO_ROOT}"
echo "[env-check] delegating to backend/scripts/check-local-env.sh"

bash "${BACKEND_SCRIPT}"
