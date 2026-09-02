#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

CURRENT_STEP=""
FAILED_STEP=""

resolve_python_bin() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    printf '%s\n' "$PYTHON_BIN"
    return 0
  fi

  local candidates=(
    "$ROOT_DIR/.venv/bin/python"
    "$ROOT_DIR/backend/.venv/bin/python"
    "$ROOT_DIR/../.venv/bin/python"
    "/home/subidha-furniture/subidha-lucky-plan/.venv/bin/python"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi

  return 1
}

run_step() {
  local label="$1"
  shift

  CURRENT_STEP="$label"
  printf '\n[%s] %s\n' "RC" "$label"
  printf '[%s] Command: %s\n' "RC" "$*"

  if "$@"; then
    printf '[%s] PASS: %s\n' "RC" "$label"
  else
    FAILED_STEP="$label"
    printf '[%s] FAIL: %s\n' "RC" "$label" >&2
    exit 1
  fi
}

trap 'if [[ -n "$FAILED_STEP" ]]; then printf "\n[RC] RELEASE CANDIDATE VALIDATION FAILED at: %s\n" "$FAILED_STEP" >&2; elif [[ -n "$CURRENT_STEP" ]]; then printf "\n[RC] RELEASE CANDIDATE VALIDATION FAILED during: %s\n" "$CURRENT_STEP" >&2; fi' ERR

PYTHON_BIN="$(resolve_python_bin)"
export PYTHON_BIN
export PLAYWRIGHT_PYTHON="${PLAYWRIGHT_PYTHON:-$PYTHON_BIN}"

printf '[RC] Repository root: %s\n' "$ROOT_DIR"
printf '[RC] Starting release-candidate validation orchestration.\n'

run_step "Backend release-candidate validation" bash "$ROOT_DIR/backend/scripts/validate-release-candidate.sh"
run_step "Frontend release-candidate validation" bash "$ROOT_DIR/frontend/scripts/validate-release-candidate.sh"
run_step "Frontend deterministic smoke suite" bash -lc "cd '$ROOT_DIR/frontend' && npm run test:e2e:smoke"
run_step "Frontend real-login auth smoke slice" bash -lc "cd '$ROOT_DIR/frontend' && npm run test:e2e:auth-smoke"

printf '\n[RC] RELEASE CANDIDATE VALIDATION PASSED\n'
