#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci
npm audit --omit=dev --audit-level=high
npm run check:routes
npm run lint
npm run typecheck
npm run build
