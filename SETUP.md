# KnowWhere Deployment & Portability Guide

This project runs as a set of Docker services: `api`, `web`, `embedding`, `reranker`, and `db` (pgvector). Use this guide to build, run, and move the stack between machines (e.g., to a Mac).

## Prerequisites
- Docker + Docker Compose
- Optional: Node 20+, Python 3.12+ if running without Docker

## Environment
Copy `.env.example` to `.env` and set your secrets/URLs. Key variables:
- `DATABASE_URL` (e.g., `postgresql://knowwhere_admin:knowwhere_admin_pass@localhost:5432/knowwhere`)
- `API_KEY` (optional; if set, use `x-api-key` on requests)
- Rate limits, model endpoints, etc.

## Build & Run (Docker)
```
docker compose build
docker compose up -d
```
Services:
- Web docs/playground: http://localhost:8080/web
- API: http://localhost:3000
- Embedding: http://localhost:8081
- Reranker: http://localhost:8082
- DB: postgres://localhost:5432/knowwhere

### GPU build (if NVIDIA available)
```
docker compose build --build-arg TORCH_DEVICE=gpu embedding reranker
docker compose up -d
```

## Ingest & Embeddings
Example ingests (run inside repo):
```
docker compose run --rm api npm run ingest:arxiv -- "cat:cs.CL" 50
docker compose run --rm api npm run ingest:crossref -- "machine learning" 50
```

Embed/backfill after ingestion:
```
# Build tsv (if needed)
docker compose run --rm api npm run backfill:tsv

# Generate embeddings for papers/chunks
docker compose run --rm api npm run backfill:embeddings
```

## Push/pull images via Docker Hub
Push (from build machine):
```
docker login
docker tag knowwhere-api yourdockerhubuser/knowwhere-api:latest
docker tag knowwhere-web yourdockerhubuser/knowwhere-web:latest
docker tag knowwhere-embedding yourdockerhubuser/knowwhere-embedding:latest
docker tag knowwhere-reranker yourdockerhubuser/knowwhere-reranker:latest
docker push yourdockerhubuser/knowwhere-api:latest
docker push yourdockerhubuser/knowwhere-web:latest
docker push yourdockerhubuser/knowwhere-embedding:latest
docker push yourdockerhubuser/knowwhere-reranker:latest
```

Pull (on target machine, e.g., Mac) and run:
```
docker pull yourdockerhubuser/knowwhere-api:latest
docker pull yourdockerhubuser/knowwhere-web:latest
docker pull yourdockerhubuser/knowwhere-embedding:latest
docker pull yourdockerhubuser/knowwhere-reranker:latest
docker pull pgvector/pgvector:pg16
docker compose up -d
```
If you change tags, update `docker-compose.yml` accordingly.

## Move images to another machine
On source machine:
```
docker save -o knowwhere-images.tar \
  knowwhere-api \
  knowwhere-web \
  knowwhere-embedding \
  knowwhere-reranker \
  pgvector/pgvector:pg16
```
Copy `knowwhere-images.tar` to the target machine, then load:
```
docker load -i knowwhere-images.tar
docker compose up -d
```
If you need ARM-native rebuild on Apple Silicon:
```
docker compose build
docker compose up -d
```

## Health checks
- API: `curl http://localhost:3000/health`
- Embedding: `curl http://localhost:8081/health`
- Reranker: `curl http://localhost:8082/health`
- DB: `docker exec -it knowwhere-db psql -U knowwhere_superadmin -d knowwhere`

## Notes
- If you change `.env`, rebuild the API container or restart compose.
- For persistent DB data, preserve the `db_data` volume or re-ingest after moving.
