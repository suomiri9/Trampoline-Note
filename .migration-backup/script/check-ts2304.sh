#!/usr/bin/env bash
# Fails if `tsc --noEmit` reports any TS2304 ("Cannot find name") error.
# esbuild bundles undefined identifiers as global refs, so TS2304 errors
# become runtime ReferenceErrors that hard-crash whole pages even though the
# build and unit tests stay green. Pre-existing type-only errors (TS2305,
# TS2339, ...) are tolerated here; see task #68 for cleaning those up.
set -uo pipefail

output="$(npx tsc --noEmit 2>&1)"
hits="$(printf '%s\n' "$output" | grep 'error TS2304' || true)"

if [ -n "$hits" ]; then
  echo "FAIL: TS2304 (Cannot find name) errors found — these crash pages at runtime:"
  printf '%s\n' "$hits"
  exit 1
fi

echo "OK: no TS2304 errors (runtime-crash class). Type-only errors, if any, are reported separately by 'npm run check'."
exit 0
