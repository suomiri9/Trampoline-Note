#!/bin/bash
# Post-merge setup: sync dependencies after a task merge.
# The "Start application" workflow rebuilds the app itself (npm run build && node dist/index.cjs),
# and the server applies schema migrations at boot — so this script only needs deps.
set -euo pipefail

npm install --no-audit --no-fund

# Keep artifact preview servers healthy if their deps changed (each installs standalone).
if [ -f artifacts/mockup-sandbox/package.json ]; then
  (cd artifacts/mockup-sandbox && npm install --no-audit --no-fund)
fi
if [ -f artifacts/intent/package.json ]; then
  if [ -f artifacts/intent/pnpm-lock.yaml ]; then
    (cd artifacts/intent && pnpm install)
  else
    (cd artifacts/intent && npm install --no-audit --no-fund)
  fi
fi
