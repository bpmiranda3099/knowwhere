-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Venues and languages
CREATE TABLE IF NOT EXISTS venues (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  type TEXT,
  acronym TEXT,
  url TEXT
);

CREATE TABLE IF NOT EXISTS languages (
  code TEXT PRIMARY KEY,
  name TEXT
);

-- Sources
CREATE TABLE IF NOT EXISTS sources (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  base_url TEXT,
  last_synced_at TIMESTAMPTZ,
  notes TEXT
);

-- Papers
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY, -- doi/arxiv_id/your id
  title TEXT,
  abstract TEXT,
  authors TEXT[],
  venue TEXT,
  venue_id BIGINT REFERENCES venues(id),
  year INT,
  doi TEXT,
  url TEXT,
  subjects TEXT[],
  source TEXT,
  source_id BIGINT REFERENCES sources(id),
  language_code TEXT REFERENCES languages(code),
  license TEXT,
  embedding VECTOR(768),
  tsv TSVECTOR
);

-- Authors and affiliations
CREATE TABLE IF NOT EXISTS authors (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  orcid TEXT
);

CREATE TABLE IF NOT EXISTS affiliations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT
);

CREATE TABLE IF NOT EXISTS paper_authors (
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  author_id BIGINT REFERENCES authors(id) ON DELETE CASCADE,
  author_order INT,
  affiliation_id BIGINT REFERENCES affiliations(id),
  PRIMARY KEY (paper_id, author_id)
);

-- Subjects taxonomy
CREATE TABLE IF NOT EXISTS subjects (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_subjects (
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (paper_id, subject_id)
);

-- Chunked text for RAG/snippets
CREATE TABLE IF NOT EXISTS paper_chunks (
  chunk_id SERIAL PRIMARY KEY,
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  chunk_text TEXT,
  chunk_embedding VECTOR(768),
  tsv TSVECTOR
);

-- Optional multi-model embeddings
CREATE TABLE IF NOT EXISTS embeddings (
  id BIGSERIAL PRIMARY KEY,
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  chunk_id INT REFERENCES paper_chunks(chunk_id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  vector VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (paper_id, chunk_id, model)
);

-- Ingestion metadata
CREATE TABLE IF NOT EXISTS ingest_runs (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT REFERENCES sources(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT,
  records_ingested INT,
  error TEXT
);

-- Citations
CREATE TABLE IF NOT EXISTS citations (
  citing_paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  cited_paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  context TEXT,
  citation_type TEXT,
  year INT,
  PRIMARY KEY (citing_paper_id, cited_paper_id)
);

-- Full text and PDF assets
CREATE TABLE IF NOT EXISTS fulltexts (
  paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  text TEXT,
  checksum TEXT,
  fetched_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pdf_assets (
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  storage_uri TEXT,
  mime_type TEXT,
  checksum TEXT,
  bytes BIGINT,
  fetched_at TIMESTAMPTZ,
  PRIMARY KEY (paper_id, storage_uri)
);

-- API keys and search logs
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS search_logs (
  id BIGSERIAL PRIMARY KEY,
  query TEXT,
  filters JSONB,
  result_count INT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  api_key_id BIGINT REFERENCES api_keys(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS papers_embedding_idx ON papers USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS papers_tsv_idx ON papers USING GIN (tsv);
CREATE INDEX IF NOT EXISTS paper_chunks_embedding_idx ON paper_chunks USING ivfflat (chunk_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS paper_chunks_tsv_idx ON paper_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS paper_authors_author_idx ON paper_authors(author_id);
CREATE INDEX IF NOT EXISTS paper_subjects_subject_idx ON paper_subjects(subject_id);
CREATE INDEX IF NOT EXISTS citations_cited_idx ON citations(cited_paper_id);
CREATE INDEX IF NOT EXISTS embeddings_model_idx ON embeddings(model);
CREATE INDEX IF NOT EXISTS search_logs_created_idx ON search_logs(created_at);

-- Populate tsvectors (run during ingestion/upsert)
-- UPDATE papers SET tsv = to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''));
-- UPDATE paper_chunks SET tsv = to_tsvector('english', coalesce(chunk_text,''));
