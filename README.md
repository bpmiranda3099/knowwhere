# KnowWhere Search API

Hybrid lexical + semantic search API for academic discovery, backed by PostgreSQL with `pgvector` and `tsvector`. Returns ranked papers/chunks for RAG without generating prose answers.

## Stack
- Fastify + TypeScript, `zod` validation, helmet + rate limiting + CORS allowlist.
- PostgreSQL with `pgvector` (KNN) and full-text search (`tsvector`/`pg_trgm`).
- Embeddings via external service (HTTP) using open models like `bge-base-en-v1.5` or `allenai/specter2`.
- Optional reranker service (e.g., `bge-reranker-base`).
- Offline/cache-friendly: populate `./models` with HF models (see `scripts/models/download_models.py`) and Docker builds will copy them into images via `HF_HOME=/models`.

## Setup
1) Install dependencies: `npm install`
2) Copy `.env.example` to `.env` and fill values.
3) Start via Docker: `docker-compose up -d` (brings up Postgres + embedding + reranker + API).
   - Apple Silicon/CPU-only: default build uses CPU wheels and will pick arm64 automatically.
   - GPU (NVIDIA): build with `--build-arg TORCH_DEVICE=gpu` for embedding/reranker (requires CUDA drivers):  
     `docker-compose build --build-arg TORCH_DEVICE=gpu embedding reranker && docker-compose up -d`
4) API is on `http://localhost:3000`; embedding on `8081`, reranker on `8082`.
5) Apply schema manually if needed: `psql -h localhost -U $DB_SUPERUSER -d knowwhere -f docs/schema.sql`.
6) Ingest from inside the api container, e.g.:
   - `docker-compose run --rm api npm run ingest:arxiv -- "cat:cs.CL" 25`
   - `docker-compose run --rm api npm run ingest:crossref -- "graph neural networks" 20`
   - `docker-compose run --rm api npm run ingest:openalex -- "graph neural networks" 20`
   (ingest scripts retry/backoff, add per-item delay, and attempt PDF text chunking when available)
7) Optional backfill:
   - `docker-compose run --rm api npm run backfill:tsv`
   - `docker-compose run --rm api npm run backfill:embeddings`

## API
- `POST /search`
  ```json
  {
    "q": "graph neural networks for molecules",
    "limit": 20,
    "mode": "hybrid",        // hybrid | lexical | semantic
    "level": "paper",        // paper | chunk
    "filters": {
      "yearFrom": 2020,
      "yearTo": 2024,
      "venue": "ICLR",
      "subject": "cs.LG",
      "source": "arxiv"
    }
  }
  ```
  Response: `{ results: [...], mode, level }`, each result includes scores, snippet, doi/url, and optional `chunkId`.

## Embedding & rerank services
- Embedding service should accept `POST { model, inputs: [text] }` and return `{"embeddings":[[...]]}` (or `{"data":[{"embedding":[...]}]}`).
- Optional rerank service accepts `POST { query, documents }` and returns `{ scores: [...] }`. If unset, rerank is skipped.

## Security defaults
- Input validation (`zod`), rate limits (global + route-level), CORS allowlist, helmet headers, API key guard (`x-api-key`) if `API_KEY` is set, no hardcoded secrets.
- Parameterized SQL only; bounded `limit` (max 50).

## Ingestion notes
- Upsert `papers` (and optional `paper_chunks`) with embeddings and `tsv` populated:
  ```sql
  UPDATE papers
    SET tsv = to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))
    WHERE id = $1;
  UPDATE paper_chunks
    SET tsv = to_tsvector('english', coalesce(chunk_text,''))
    WHERE paper_id = $1;
  ```
- Deduplicate on `id` (use DOI/arXiv id where possible). Chunk text into ~200–400 word segments for better snippets.
