#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

CURRENT_STEP=""
FAILED_STEP=""

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

printf '[RC] Repository root: %s\n' "$ROOT_DIR"
printf '[RC] Starting release-candidate validation orchestration.\n'

run_step "Backend release-candidate validation" bash "$ROOT_DIR/backend/scripts/validate-release-candidate.sh"
run_step "Frontend release-candidate validation" bash "$ROOT_DIR/frontend/scripts/validate-release-candidate.sh"
run_step "Frontend deterministic smoke suite" bash -lc "cd '$ROOT_DIR/frontend' && npm run test:e2e:smoke"
run_step "Frontend real-login auth smoke slice" bash -lc "cd '$ROOT_DIR/frontend' && npm run test:e2e:auth-smoke"

printf '\n[RC] RELEASE CANDIDATE VALIDATION PASSED\n'
