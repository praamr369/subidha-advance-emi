#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[env-check] python3 is not installed or not in PATH."
  exit 1
fi

resolve_venv_python() {
  local candidates=(
    "${ROOT_DIR}/.venv/bin/python"
    "${ROOT_DIR}/../.venv/bin/python"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

if ! VENV_PY="$(resolve_venv_python)"; then
  cat <<'EOF'
[env-check] No usable virtualenv python was found.
Create it with:
  cd backend
  python3 -m venv .venv
  source .venv/bin/activate
  python3 -m pip install --upgrade pip
  python3 -m pip install -r requirements.txt
Or (repo-level venv):
  python3 -m venv .venv
  source .venv/bin/activate
  python3 -m pip install -r backend/requirements.txt
EOF
  exit 1
fi

if ! "${VENV_PY}" -c "import django" >/dev/null 2>&1; then
  cat <<'EOF'
[env-check] Django import failed in the selected virtualenv.
Install requirements:
  cd backend
  source .venv/bin/activate   # or source ../.venv/bin/activate
  python3 -m pip install -r requirements.txt
EOF
  exit 1
fi

echo "[env-check] python3: $(python3 --version)"
echo "[env-check] venv python: $("${VENV_PY}" --version)"
echo "[env-check] venv path: ${VENV_PY}"
echo "[env-check] django import: ok"

echo "[env-check] running manage.py check..."
"${VENV_PY}" manage.py check
echo "[env-check] environment looks ready."
