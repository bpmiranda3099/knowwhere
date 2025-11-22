export const INGEST_DEFAULTS = {
  chunkWords: 200,
  chunkOverlap: 40,
  retryAttempts: 3,
  retryBaseDelayMs: 500
};

export const BACKFILL = {
  batchSize: 25
};

export const SOURCES = {
  ARXIV_API: 'http://export.arxiv.org/api/query',
  CROSSREF_API: 'https://api.crossref.org/works',
  OPENALEX_API: 'https://api.openalex.org/works'
};

export const USER_AGENT = 'knowwhere/0.1 (+local)';

export const CLI_DEFAULTS = {
  arxivQuery: 'cat:cs.CL',
  arxivMaxResults: 50,
  crossrefQuery: 'machine learning',
  crossrefRows: 20,
  openalexQuery: 'machine learning',
  openalexPerPage: 20
};

export const INGEST_RATE_LIMIT = {
  perRequestDelayMs: 200
};
