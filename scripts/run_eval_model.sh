#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
K_VALUES="${K_VALUES:-5,10}"
RUNS="${RUNS:-1}"
BATCH="${BATCH:-2}"
LEVEL="${LEVEL:-paper}"
MODES="${MODES:-hybrid,lexical,semantic}"

npm run eval:phase2 -- \
  --baseUrl "${BASE_URL}" \
  --modes "${MODES}" \
  --k "${K_VALUES}" \
  --runs "${RUNS}" \
  --batchSize "${BATCH}" \
  --level "${LEVEL}"
