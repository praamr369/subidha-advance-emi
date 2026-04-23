#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"

SMOKE_DB_PATH="${PLAYWRIGHT_DB_PATH:-/tmp/subidha-playwright-smoke.sqlite3}"
SMOKE_META_PATH="${PLAYWRIGHT_SMOKE_META_PATH:-${BACKEND_ROOT}/playwright-smoke-meta.json}"
SMOKE_MANIFEST_PATH="${PLAYWRIGHT_SMOKE_MANIFEST_PATH:-${REPO_ROOT}/frontend/tests/e2e/.generated/smoke-manifest.json}"
DJANGO_SETTINGS="${DJANGO_SETTINGS_MODULE:-core.settings.playwright}"

find_python_candidate() {
  local configured="${PLAYWRIGHT_PYTHON:-${PYTHON_BIN:-}}"
  if [[ -n "${configured}" ]]; then
    echo "${configured}"
    return 0
  fi

  local candidates=(
    "${REPO_ROOT}/.venv/bin/python"
    "${BACKEND_ROOT}/.venv/bin/python"
    "${BACKEND_ROOT}/.playwright-venv/bin/python"
    "python3"
  )

  for candidate in "${candidates[@]}"; do
    if [[ "${candidate}" == "python3" || -x "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

python_has_django() {
  local python_bin="$1"
  "${python_bin}" -c "import django" >/dev/null 2>&1
}

ensure_playwright_venv() {
  local venv_python="${BACKEND_ROOT}/.playwright-venv/bin/python"
  if [[ ! -x "${venv_python}" ]]; then
    python3 -m venv "${BACKEND_ROOT}/.playwright-venv"
  fi
  if [[ -n "${PLAYWRIGHT_PY_WHEELHOUSE:-}" ]]; then
    "${venv_python}" -m pip install \
      --no-index \
      --find-links "${PLAYWRIGHT_PY_WHEELHOUSE}" \
      -r "${BACKEND_ROOT}/requirements.txt"
  else
    "${venv_python}" -m pip install -r "${BACKEND_ROOT}/requirements.txt"
  fi
  echo "${venv_python}"
}

PYTHON_EXECUTABLE="$(find_python_candidate)"
if ! python_has_django "${PYTHON_EXECUTABLE}"; then
  echo "[playwright-backend] Django was not found in ${PYTHON_EXECUTABLE}. Bootstrapping backend/.playwright-venv..." >&2
  PYTHON_EXECUTABLE="$(ensure_playwright_venv)"
fi

if ! python_has_django "${PYTHON_EXECUTABLE}"; then
  echo "[playwright-backend] Unable to import Django with ${PYTHON_EXECUTABLE}." >&2
  echo "[playwright-backend] Provide PLAYWRIGHT_PYTHON pointing at a ready virtualenv, or provide offline wheels via PLAYWRIGHT_PY_WHEELHOUSE." >&2
  exit 1
fi

rm -f "${SMOKE_DB_PATH}" "${SMOKE_META_PATH}" "${SMOKE_MANIFEST_PATH}"

"${PYTHON_EXECUTABLE}" "${BACKEND_ROOT}/manage.py" migrate --noinput --settings "${DJANGO_SETTINGS}"
"${PYTHON_EXECUTABLE}" "${BACKEND_ROOT}/manage.py" seed_playwright_smoke --settings "${DJANGO_SETTINGS}"
"${PYTHON_EXECUTABLE}" "${BACKEND_ROOT}/manage.py" runserver 127.0.0.1:8100 --settings "${DJANGO_SETTINGS}" --noreload
