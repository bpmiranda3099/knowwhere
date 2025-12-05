import { query } from '../db/db';
import { embedText } from './embeddingClient';
import { rerank } from './rerankService';
import { Level, Mode, SearchFilters, SearchRequest, SearchResult } from '../types';
import {
  SEARCH_LIMITS,
  SEARCH_CANDIDATES,
  SEARCH_WEIGHTS,
  SNIPPET_LENGTH
} from '../config/search/constants';

function vectorLiteral(vec: number[]): string {
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Embedding vector missing');
  }
  return `[${vec.join(',')}]`;
}

function buildFilters(
  alias: string,
  filters: SearchFilters | undefined,
  values: unknown[]
): string {
  const clauses: string[] = [];
  if (!filters) return '';

  if (filters.yearFrom) {
    values.push(filters.yearFrom);
    clauses.push(`${alias}.year >= $${values.length}`);
  }
  if (filters.yearTo) {
    values.push(filters.yearTo);
    clauses.push(`${alias}.year <= $${values.length}`);
  }
  if (filters.venue) {
    values.push(filters.venue);
    clauses.push(`${alias}.venue ILIKE $${values.length}`);
  }
  if (filters.subject) {
    values.push(filters.subject);
    clauses.push(`${alias}.subjects @> ARRAY[$${values.length}]::text[]`);
  }
  if (filters.source) {
    values.push(filters.source);
    clauses.push(`${alias}.source = $${values.length}`);
  }

  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

interface PaperRow {
  id: string;
  title: string | null;
  abstract: string | null;
  doi: string | null;
  url: string | null;
  subjects: string[] | null;
  source: string | null;
  snippet: string | null;
  lex_score?: number | null;
  sem_score?: number | null;
  hybrid_score: number | null;
}

interface ChunkRow extends PaperRow {
  chunk_id: number | null;
}

export async function search(request: SearchRequest): Promise<SearchResult[]> {
  const limit = Math.min(request.limit ?? SEARCH_LIMITS.default, SEARCH_LIMITS.max);
  const mode: Mode = request.mode ?? 'hybrid';
  const level: Level = request.level ?? 'paper';

  const needsEmbedding = mode !== 'lexical';
  const embedding = needsEmbedding ? await embedText(request.q) : null;

  const { sql, values } =
    level === 'chunk'
      ? buildChunkQuery(request.q, mode, request.filters, limit, embedding)
      : buildPaperQuery(request.q, mode, request.filters, limit, embedding);

  if (process.env.DEBUG_SEARCH) {
    // eslint-disable-next-line no-console
    console.log('[search debug]', { mode, level, filters: request.filters, sql, values });
  }

  const { rows } = await query<PaperRow | ChunkRow>(sql, values);

  const baseResults: SearchResult[] = rows.map((row: PaperRow | ChunkRow) => ({
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    doi: row.doi,
    url: row.url,
    subjects: row.subjects,
    source: row.source,
    snippet: row.snippet,
    lexScore: 'lex_score' in row ? row.lex_score ?? undefined : undefined,
    semScore: 'sem_score' in row ? row.sem_score ?? undefined : undefined,
    hybridScore: row.hybrid_score,
    chunkId: 'chunk_id' in row ? row.chunk_id ?? undefined : undefined
  }));

  // Optional rerank on snippet text for top results.
  const rerankCandidates = baseResults.slice(0, Math.min(baseResults.length, 3));
  const rerankScores =
    mode === 'hybrid' || mode === 'semantic'
      ? await rerank(
          request.q,
          rerankCandidates.map((r) => r.snippet ?? r.abstract ?? r.title ?? '')
        )
      : null;

  if (rerankScores) {
    const scored = rerankCandidates.map((result, idx) => ({
      result,
      score: rerankScores[idx] ?? 0
    }));
    return scored
      .sort((a, b) => b.score - a.score)
      .map(({ result }) => result);
  }

  return baseResults;
}

function buildPaperQuery(
  q: string,
  mode: Mode,
  filters: SearchFilters | undefined,
  limit: number,
  embedding: number[] | null
) {
  const values: unknown[] = [q];

  if (mode === 'lexical') {
    const filterSql = buildFilters('p', filters, values);
    values.push(limit);
    const sql = `
      WITH q AS (
        SELECT plainto_tsquery('english', $1) AS q_ts
      )
      SELECT p.id,
             p.title,
             p.abstract,
             p.doi,
             p.url,
             p.subjects,
             p.source,
             LEFT(p.abstract, ${SNIPPET_LENGTH}) AS snippet,
             ts_rank_cd(p.tsv, q.q_ts) AS lex_score,
             NULL::float AS sem_score,
             ts_rank_cd(p.tsv, q.q_ts) AS hybrid_score
      FROM papers p, q
      WHERE q.q_ts <> '' AND p.tsv @@ q.q_ts${filterSql}
      ORDER BY lex_score DESC
      LIMIT $${values.length};
    `;
    return { sql, values };
  }

  const vectorParam = vectorLiteral(embedding ?? []);

  if (mode === 'semantic') {
    const semanticValues: unknown[] = [];
    const vectorIdx = semanticValues.push(vectorParam);
    const filterSql = buildFilters('p', filters, semanticValues);
    semanticValues.push(limit);
    const vectorRef = `$${vectorIdx}`;
    const sql = `
      SELECT p.id,
             p.title,
             p.abstract,
             p.doi,
             p.url,
             p.subjects,
             p.source,
             LEFT(p.abstract, ${SNIPPET_LENGTH}) AS snippet,
             NULL::float AS lex_score,
             1 - (p.embedding <=> ${vectorRef}::vector) AS sem_score,
             1 - (p.embedding <=> ${vectorRef}::vector) AS hybrid_score
      FROM papers p
      WHERE p.embedding IS NOT NULL${filterSql}
      ORDER BY p.embedding <=> ${vectorRef}::vector
      LIMIT $${semanticValues.length};
    `;
    return { sql, values: semanticValues };
  }

  // hybrid
  const filterSql = buildFilters('p', filters, values);
  const vectorIdx = values.push(vectorParam);
  values.push(limit);
  const limitParam = values.length;
  const vectorRef = `$${vectorIdx}`;
  const sql = `
    WITH q AS (
      SELECT
        plainto_tsquery('english', $1) AS q_ts,
        ${vectorRef}::vector AS q_vec
    ),
    lex AS (
      SELECT p.id, p.title, p.abstract, p.doi, p.url, p.subjects, p.source,
             LEFT(p.abstract, ${SNIPPET_LENGTH}) AS snippet,
             ts_rank_cd(p.tsv, q.q_ts) AS lex_score,
             NULL::float AS sem_score
      FROM papers p, q
      WHERE q.q_ts <> '' AND p.tsv @@ q.q_ts${filterSql}
      ORDER BY lex_score DESC
      LIMIT ${SEARCH_CANDIDATES.hybridLexical}
    ),
    sem AS (
      SELECT p.id, p.title, p.abstract, p.doi, p.url, p.subjects, p.source,
             LEFT(p.abstract, ${SNIPPET_LENGTH}) AS snippet,
             NULL::float AS lex_score,
             1 - (p.embedding <=> q.q_vec) AS sem_score
      FROM papers p, q
      WHERE p.embedding IS NOT NULL${filterSql}
      ORDER BY p.embedding <=> q.q_vec
      LIMIT ${SEARCH_CANDIDATES.hybridSemantic}
    ),
    fused AS (
      SELECT id, title, abstract, doi, url, subjects, source, snippet,
             max(lex_score) AS lex_score,
             max(sem_score) AS sem_score,
             coalesce(max(lex_score), 0) * ${SEARCH_WEIGHTS.lexical} + coalesce(max(sem_score), 0) * ${SEARCH_WEIGHTS.semantic} AS hybrid_score
      FROM (
        SELECT * FROM lex
        UNION ALL
        SELECT * FROM sem
      ) s
      GROUP BY id, title, abstract, doi, url, subjects, source, snippet
    )
    SELECT * FROM fused
    ORDER BY hybrid_score DESC
    LIMIT $${limitParam};
  `;
  return { sql, values };
}

function buildChunkQuery(
  q: string,
  mode: Mode,
  filters: SearchFilters | undefined,
  limit: number,
  embedding: number[] | null
) {
  const values: unknown[] = [q];

  if (mode === 'lexical') {
    const filterSql = buildFilters('p', filters, values);
    values.push(limit);
    const sql = `
      WITH q AS (
        SELECT plainto_tsquery('english', $1) AS q_ts
      )
      SELECT p.id,
             p.title,
             p.abstract,
             p.doi,
             p.url,
             p.subjects,
             p.source,
             c.chunk_id,
             LEFT(c.chunk_text, ${SNIPPET_LENGTH}) AS snippet,
             ts_rank_cd(c.tsv, q.q_ts) AS lex_score,
             NULL::float AS sem_score,
             ts_rank_cd(c.tsv, q.q_ts) AS hybrid_score
      FROM paper_chunks c
      JOIN papers p ON c.paper_id = p.id, q
      WHERE q.q_ts <> '' AND c.tsv @@ q.q_ts${filterSql}
      ORDER BY lex_score DESC
      LIMIT $${values.length};
    `;
    return { sql, values };
  }

  const vectorParam = vectorLiteral(embedding ?? []);

  if (mode === 'semantic') {
    const semanticValues: unknown[] = [];
    const vectorIdx = semanticValues.push(vectorParam);
    const filterSql = buildFilters('p', filters, semanticValues);
    semanticValues.push(limit);
    const vectorRef = `$${vectorIdx}`;
    const sql = `
      SELECT p.id,
             p.title,
             p.abstract,
             p.doi,
             p.url,
             p.subjects,
             p.source,
             c.chunk_id,
             LEFT(c.chunk_text, ${SNIPPET_LENGTH}) AS snippet,
             NULL::float AS lex_score,
             1 - (c.chunk_embedding <=> ${vectorRef}::vector) AS sem_score,
             1 - (c.chunk_embedding <=> ${vectorRef}::vector) AS hybrid_score
      FROM paper_chunks c
      JOIN papers p ON c.paper_id = p.id
      WHERE c.chunk_embedding IS NOT NULL${filterSql}
      ORDER BY c.chunk_embedding <=> ${vectorRef}::vector
      LIMIT $${semanticValues.length};
    `;
    return { sql, values: semanticValues };
  }

  // hybrid
  const filterSql = buildFilters('p', filters, values);
  const vectorIdx = values.push(vectorParam);
  values.push(limit);
  const limitParam = values.length;
  const vectorRef = `$${vectorIdx}`;
  const sql = `
    WITH q AS (
      SELECT
        plainto_tsquery('english', $1) AS q_ts,
        ${vectorRef}::vector AS q_vec
    ),
    lex AS (
      SELECT p.id, p.title, p.abstract, p.doi, p.url, p.subjects, p.source,
             c.chunk_id,
             LEFT(c.chunk_text, ${SNIPPET_LENGTH}) AS snippet,
             ts_rank_cd(c.tsv, q.q_ts) AS lex_score,
             NULL::float AS sem_score
      FROM paper_chunks c
      JOIN papers p ON c.paper_id = p.id, q
      WHERE q.q_ts <> '' AND c.tsv @@ q.q_ts${filterSql}
      ORDER BY lex_score DESC
      LIMIT ${SEARCH_CANDIDATES.hybridLexical}
    ),
    sem AS (
      SELECT p.id, p.title, p.abstract, p.doi, p.url, p.subjects, p.source,
             c.chunk_id,
             LEFT(c.chunk_text, ${SNIPPET_LENGTH}) AS snippet,
             NULL::float AS lex_score,
             1 - (c.chunk_embedding <=> q.q_vec) AS sem_score
      FROM paper_chunks c
      JOIN papers p ON c.paper_id = p.id, q
      WHERE c.chunk_embedding IS NOT NULL${filterSql}
      ORDER BY c.chunk_embedding <=> q.q_vec
      LIMIT ${SEARCH_CANDIDATES.hybridSemantic}
    ),
    fused AS (
      SELECT id, title, abstract, doi, url, subjects, source, chunk_id, snippet,
             max(lex_score) AS lex_score,
             max(sem_score) AS sem_score,
             coalesce(max(lex_score), 0) * ${SEARCH_WEIGHTS.lexical} + coalesce(max(sem_score), 0) * ${SEARCH_WEIGHTS.semantic} AS hybrid_score
      FROM (
        SELECT * FROM lex
        UNION ALL
        SELECT * FROM sem
      ) s
      GROUP BY id, title, abstract, doi, url, subjects, source, chunk_id, snippet
    )
    SELECT * FROM fused
    ORDER BY hybrid_score DESC
    LIMIT $${limitParam};
  `;
  return { sql, values };
}
