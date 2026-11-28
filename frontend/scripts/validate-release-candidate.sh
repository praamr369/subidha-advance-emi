#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${SKIP_NPM_CI:-0}" != "1" ]]; then
  npm ci --no-audit --prefer-offline
fi

if [[ "${RUN_NPM_AUDIT:-0}" == "1" ]]; then
  npm audit --omit=dev --audit-level=high || true
fi

npm run check:routes
npm run test:unit
npm run lint
npm run typecheck
npm run build
