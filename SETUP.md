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
docker tag knowwhere-api your_dockerhub_user/knowwhere-api:latest
docker tag knowwhere-web your_dockerhub_user/knowwhere-web:latest
docker tag knowwhere-embedding your_dockerhub_user/knowwhere-embedding:latest
docker tag knowwhere-reranker your_dockerhub_user/knowwhere-reranker:latest
docker push your_dockerhub_user/knowwhere-api:latest
docker push your_dockerhub_user/knowwhere-web:latest
docker push your_dockerhub_user/knowwhere-embedding:latest
docker push your_dockerhub_user/knowwhere-reranker:latest
# Rebuild local images after code changes (optional):
# docker compose build api web embedding reranker
# docker compose up -d
```

Pull (on target machine, e.g., Mac) and run:
```
docker pull your_dockerhub_user/knowwhere-api:latest
docker pull your_dockerhub_user/knowwhere-web:latest
docker pull your_dockerhub_user/knowwhere-embedding:latest
docker pull your_dockerhub_user/knowwhere-reranker:latest
docker pull your_dockerhub_user/knowwhere-db:pg16
docker compose up -d    # use pulled images
# To recreate with latest pulled images:
# docker compose up -d --force-recreate
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

## KnowWhere DB setup (clean pgvector with schema baked in)
- Use the prepped image with schema/roles: `your_dockerhub_user/knowwhere-db:pg16` (or the upstream `pgvector/pgvector:pg16` if you prefer to apply schema yourself).
- In `docker-compose.yml`, set the `db` service image accordingly.
- Start clean: `docker compose down -v` then `docker compose up -d`.
- Health check: `docker exec knowwhere-db psql -U knowwhere_superadmin -d knowwhere -c "SELECT NOW();"`

Reset ingestion data (keep DB instance):
```
docker exec knowwhere-db psql -U knowwhere_superadmin -d knowwhere -c "
TRUNCATE TABLE paper_chunks, paper_authors, paper_subjects, papers, authors, subjects, venues, sources,
ingest_runs, pdf_assets, fulltexts, embeddings, search_logs, languages, api_keys, citations
RESTART IDENTITY CASCADE;
"
```
