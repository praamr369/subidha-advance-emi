#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[env-check] python3 is not installed or not in PATH."
  exit 1
fi

if [[ ! -d ".venv" ]]; then
  cat <<'EOF'
[env-check] backend/.venv is missing.
Create it with:
  cd backend
  python3 -m venv .venv
  source .venv/bin/activate
  python3 -m pip install --upgrade pip
  python3 -m pip install -r requirements.txt
EOF
  exit 1
fi

if [[ ! -x ".venv/bin/python" ]]; then
  echo "[env-check] backend/.venv exists but .venv/bin/python is missing."
  exit 1
fi

VENV_PY=".venv/bin/python"

if ! "${VENV_PY}" -c "import django" >/dev/null 2>&1; then
  cat <<'EOF'
[env-check] Django import failed in backend/.venv.
Install requirements:
  cd backend
  source .venv/bin/activate
  python3 -m pip install -r requirements.txt
EOF
  exit 1
fi

echo "[env-check] python3: $(python3 --version)"
echo "[env-check] venv python: $("${VENV_PY}" --version)"
echo "[env-check] django import: ok"

echo "[env-check] running manage.py check..."
"${VENV_PY}" manage.py check
echo "[env-check] environment looks ready."
