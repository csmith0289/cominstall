#!/usr/bin/env bash
# Runs the same suite as CI on this machine: install, typecheck, unit tests, then the e2e tests
# (retried once for the cold-start flake, #100). Used by the pre-push hook and by land-pr.sh,
# so nothing reaches GitHub untested while Actions is unavailable.
#
# Usage (Git Bash, from anywhere in the repo):  bash scripts/check.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pnpm() { corepack pnpm "$@" </dev/null; }

started=$(date +%s)
echo "== install"
pnpm install --frozen-lockfile >/dev/null
echo "== typecheck"
pnpm typecheck
echo "== unit tests"
pnpm test
echo "== e2e tests"
# Fetches Chromium the first time only; later runs return straight away.
pnpm exec playwright install chromium >/dev/null
pnpm test:e2e || { echo "== e2e failed once, retrying (cold-start flake #100)"; pnpm test:e2e; }
echo "== all checks passed in $(( $(date +%s) - started ))s"
