#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/run_model_pair.sh "EMBEDDING_MODEL=sentence-transformers/all-mpnet-base-v2" "RERANKER_MODEL=BAAI/bge-reranker-base"

EMB="${1:-EMBEDDING_MODEL=BAAI/bge-base-en-v1.5}"
RER="${2:-RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-4-v2}"
EMB_MODEL_NAME="${EMB/EMBEDDING_MODEL=/}"
RER_MODEL_NAME="${RER/RERANKER_MODEL=/}"

echo "Starting with ${EMB} and ${RER}"

# Ensure DB is up
docker compose up -d db

# Stop and remove previous services
docker compose stop embedding reranker api >/dev/null 2>&1 || true
docker compose rm -f embedding reranker api >/dev/null 2>&1 || true

# Start embedding and reranker with overrides
MODEL_NAME="${EMB_MODEL_NAME}" docker compose up -d --no-deps embedding
MODEL_NAME="${RER_MODEL_NAME}" docker compose up -d --no-deps reranker

# Wait for health
echo "Waiting for embedding health..."
until docker compose exec embedding curl -sf http://localhost:8081/health >/dev/null 2>&1; do sleep 3; done
echo "Waiting for reranker health..."
until docker compose exec reranker curl -sf http://localhost:8082/health >/dev/null 2>&1; do sleep 3; done

# Start API with matching env
env ${EMB} ${RER} docker compose up -d --no-deps api
echo "Waiting for api health..."
until docker compose exec api curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 3; done

echo "Embedding health:"
docker compose exec embedding curl -sf http://localhost:8081/health
echo
echo "Reranker health:"
docker compose exec reranker curl -sf http://localhost:8082/health
