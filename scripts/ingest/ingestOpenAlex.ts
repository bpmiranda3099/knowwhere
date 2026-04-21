import { closePool, getClient } from '../../src/db/db';
import { embedText } from '../../src/services/embeddingClient';
import { chunkText } from '../utils/chunk';
import { fetchWithRetry } from '../utils/retry';
import { fetchPdfText } from '../utils/pdf';
import { CLI_DEFAULTS, SOURCES, USER_AGENT, INGEST_DEFAULTS, INGEST_RATE_LIMIT } from '../../src/config/ingest/constants';
import { z } from 'zod';
import { pause } from '../utils/rateLimit';
import { IngestRunOptions, IngestRunResult } from './shared';
import {
  ensureAuthor,
  ensureLanguage,
  ensureSource,
  ensureSubject,
  ensureVenue,
  linkPaperAuthor,
  linkPaperSubject
} from '../utils/ingestDb';

function shouldLogItems(): boolean {
  const v = process.env.INGEST_LOG_ITEMS;
  return v === '1' || v === 'true';
}

interface OpenAlexWork {
  id: string;
  display_name?: string;
  abstract_inverted_index?: Record<string, number[]>;
  doi?: string;
  primary_location?: { source?: { display_name?: string }; landing_page_url?: string; pdf_url?: string };
  publication_year?: number;
  authorships?: Array<{ author?: { display_name?: string } }>;
  topics?: Array<{ topic?: { display_name?: string } }>;
  language?: string;
}

function decodeAbstract(inv?: Record<string, number[]>): string {
  if (!inv) return '';
  const entries = Object.entries(inv);
  const words: string[] = [];
  for (const [word, positions] of entries) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(' ');
}

function stripNul(s: string): string {
  return s.replace(/\u0000/g, '');
}

function cleanText(s?: string | null): string {
  return stripNul((s ?? '').toString());
}

function cleanTextArray(arr?: Array<string | null | undefined>): string[] {
  if (!arr) return [];
  return arr.map((v) => cleanText(v)).filter(Boolean);
}

async function fetchOpenAlex(query: string, perPage = 20): Promise<OpenAlexWork[]> {
  const mailto = process.env.OPENALEX_EMAIL?.trim();
  const url = `${SOURCES.OPENALEX_API}?search=${encodeURIComponent(query)}&per-page=${perPage}${
    mailto ? `&mailto=${encodeURIComponent(mailto)}` : ''
  }`;
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
  const json = await res.json();
  return json.results as OpenAlexWork[];
}

async function fetchOpenAlexMany(query: string, total: number, pacingMs: number): Promise<OpenAlexWork[]> {
  const items: OpenAlexWork[] = [];
  const maxPerPage = 200;
  let page = 1;

  while (items.length < total) {
    const perPage = Math.min(maxPerPage, total - items.length);
    await pause(pacingMs);

    const mailto = process.env.OPENALEX_EMAIL?.trim();
    const url = `${SOURCES.OPENALEX_API}?search=${encodeURIComponent(query)}&per-page=${perPage}&page=${page}${
      mailto ? `&mailto=${encodeURIComponent(mailto)}` : ''
    }`;
    const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
    const json = await res.json();
    const pageItems = (json.results as OpenAlexWork[]) ?? [];
    if (!pageItems.length) break;
    items.push(...pageItems);
    // eslint-disable-next-line no-console
    console.log(`[ingest][openalex] fetched page=${page} got=${pageItems.length} total=${items.length}/${total} query="${query}"`);
    page += 1;

    // Safety valve: don't loop forever on weird APIs.
    if (page > 2000) break;
  }

  return items.slice(0, total);
}

async function upsert(items: OpenAlexWork[]) {
  const client = await getClient();
  try {
    const sourceId = await ensureSource(client, 'openalex', 'https://api.openalex.org/works');
    const idsToCheck: string[] = [];
    const doisToCheck: string[] = [];
    for (const item of items) {
      const resolvedId = item.doi ?? item.id;
      if (resolvedId) idsToCheck.push(resolvedId);
      if (item.doi) doisToCheck.push(item.doi);
    }

    const uniqueIds = Array.from(new Set(idsToCheck));
    const uniqueDois = Array.from(new Set(doisToCheck));
    const existingIds = new Set<string>();
    const existingDois = new Set<string>();

    if (uniqueIds.length || uniqueDois.length) {
      const res = await client.query<{ id: string; doi: string | null }>(
        `
        SELECT id, doi
        FROM papers
        WHERE (cardinality($1::text[]) > 0 AND id = ANY($1::text[]))
           OR (cardinality($2::text[]) > 0 AND doi IS NOT NULL AND doi = ANY($2::text[]));
        `,
        [uniqueIds, uniqueDois]
      );
      for (const row of res.rows) {
        if (row.id) existingIds.add(row.id);
        if (row.doi) existingDois.add(row.doi);
      }
    }

    let processed = 0;
    for (const item of items) {
      await pause(INGEST_RATE_LIMIT.perRequestDelayMs);
      const id = item.doi ?? item.id;
      if (!id) continue;
      if (existingIds.has(id) || (item.doi && existingDois.has(item.doi))) {
        continue;
      }
      const title = cleanText(item.display_name);
      if (shouldLogItems()) {
        // eslint-disable-next-line no-console
        console.log('[ingest][openalex]', { id, title });
      }
      const abstract = cleanText(decodeAbstract(item.abstract_inverted_index));
      const year = item.publication_year ?? null;
      const venue = cleanText(item.primary_location?.source?.display_name ?? null) || null;
      const url = cleanText(item.primary_location?.landing_page_url ?? item.primary_location?.pdf_url ?? null) || null;
      const subjects = cleanTextArray(item.topics?.map((t) => t.topic?.display_name));
      const authors = cleanTextArray(item.authorships?.map((a) => a.author?.display_name));
      const languageCode = await ensureLanguage(client, item.language ?? null);
      const pdfUrl = item.primary_location?.pdf_url;
      const pdfText = pdfUrl ? await fetchPdfText(pdfUrl) : null;
      const contentRaw = pdfText && pdfText.length > abstract.length ? pdfText : abstract || title;
      const content = cleanText(contentRaw);
      const venueId = await ensureVenue(client, venue);

      const embedding = await embedText(`${title}\n${content}`);
      const embeddingLiteral = `[${embedding.join(',')}]`;

      await client.query(
        `
        INSERT INTO papers (id, title, abstract, authors, venue_id, year, doi, url, subjects, source_id, language_code, license, embedding, tsv)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::vector,
          to_tsvector('english', coalesce($2,'') || ' ' || coalesce($3,'')))
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          abstract = EXCLUDED.abstract,
          authors = EXCLUDED.authors,
          venue_id = EXCLUDED.venue_id,
          year = EXCLUDED.year,
          doi = EXCLUDED.doi,
          url = EXCLUDED.url,
          subjects = EXCLUDED.subjects,
          source_id = EXCLUDED.source_id,
          language_code = EXCLUDED.language_code,
          license = EXCLUDED.license,
          embedding = EXCLUDED.embedding,
          tsv = EXCLUDED.tsv;
        `,
        [
          id,
          title,
          abstract || content,
          authors,
          venueId,
          year,
          item.doi ?? null,
          url,
          subjects,
          sourceId,
          languageCode,
          null,
          embeddingLiteral
        ]
      );

      const chunks = chunkText(content || title, INGEST_DEFAULTS.chunkWords, INGEST_DEFAULTS.chunkOverlap).map(cleanText).filter(Boolean);
      for (const chunk of chunks) {
        const chunkEmbedding = await embedText(chunk);
        const chunkLiteral = `[${chunkEmbedding.join(',')}]`;
        await client.query(
          `
          INSERT INTO paper_chunks (paper_id, chunk_text, chunk_embedding, tsv)
          VALUES ($1, $2, $3::vector, to_tsvector('english', coalesce($2,'')))
          ON CONFLICT DO NOTHING;
          `,
          [id, chunk, chunkLiteral]
        );
      }

      if (subjects.length) {
        for (const subj of subjects) {
          const subjectId = await ensureSubject(client, subj, subj);
          await linkPaperSubject(client, id, subjectId);
        }
      }

      if (authors.length) {
        for (const [idx, authorName] of authors.entries()) {
          const authorId = await ensureAuthor(client, authorName);
          await linkPaperAuthor(client, id, authorId, idx + 1);
        }
      }

      processed += 1;
    }

    return processed;
  } finally {
    client.release();
  }
}

export async function runOpenAlexIngest(options: IngestRunOptions): Promise<IngestRunResult> {
  const quantity = Math.max(1, Math.min(2000, options.quantity));
  const items =
    quantity <= 200 ? await fetchOpenAlex(options.query, quantity) : await fetchOpenAlexMany(options.query, quantity, options.pacingMs);
  const processed = await upsert(items);

  return {
    fetched: items.length,
    processed,
    source: 'openalex'
  };
}

async function main() {
  const argsSchema = z.object({
    query: z.string().min(1).default(CLI_DEFAULTS.openalexQuery),
    perPage: z.coerce.number().int().positive().max(200).default(CLI_DEFAULTS.openalexPerPage)
  });
  const args = argsSchema.parse({ query: process.argv[2], perPage: process.argv[3] });
  await runOpenAlexIngest({
    query: args.query,
    quantity: args.perPage,
    pacingMs: INGEST_RATE_LIMIT.sources.openalex.requestDelayMs
  });
}

if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('ingestOpenAlex failed', err);
      process.exit(1);
    })
    .finally(async () => {
      await closePool();
    });
}
