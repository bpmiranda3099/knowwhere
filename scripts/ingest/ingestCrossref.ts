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

function progressEvery(): number {
  const raw = process.env.INGEST_PROGRESS_EVERY;
  const n = raw ? Number(raw) : 10;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

interface CrossrefItem {
  DOI: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string }>;
  issued?: { 'date-parts': number[][] };
  URL?: string;
  subject?: string[];
  'container-title'?: string[];
  link?: Array<{ URL?: string; 'content-type'?: string }>;
}

async function fetchCrossref(query: string, rows = 20): Promise<CrossrefItem[]> {
  const url = `${SOURCES.CROSSREF_API}?query=${encodeURIComponent(query)}&rows=${rows}`;
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
  const json = await res.json();
  return json.message.items as CrossrefItem[];
}

async function upsert(items: CrossrefItem[]) {
  const client = await getClient();
  try {
    const sourceId = await ensureSource(client, 'crossref', 'https://api.crossref.org/works');
    let processed = 0;
    const every = progressEvery();
    // eslint-disable-next-line no-console
    console.log('[ingest][crossref] upserting', { totalFetched: items.length, progressEvery: every });
    for (const item of items) {
      await pause(INGEST_RATE_LIMIT.perRequestDelayMs);
      const id = item.DOI ?? item.URL;
      if (!id) continue;
      const title = item.title?.[0] ?? '';
      if (shouldLogItems()) {
        // eslint-disable-next-line no-console
        console.log('[ingest][crossref]', { id, title });
      }
      const abstract = item.abstract?.replace(/<\/?jats:[^>]+>/g, '').replace(/<[^>]+>/g, '') ?? '';
      const year = item.issued?.['date-parts']?.[0]?.[0] ?? null;
      const subjects = item.subject ?? [];
      const authors =
        item.author?.map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean) ?? [];
      const venue = item['container-title']?.[0] ?? null;
      const venueId = await ensureVenue(client, venue);
      const pdfUrl = item.link?.find?.((l: any) => l['content-type'] === 'application/pdf')?.URL;
      const pdfText = pdfUrl ? await fetchPdfText(pdfUrl) : null;
      const content = pdfText && pdfText.length > abstract.length ? pdfText : abstract || title;

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
          item.DOI ?? null,
          item.URL ?? null,
          subjects,
          sourceId,
          null,
          null,
          embeddingLiteral
        ]
      );

      const chunks = chunkText(content || title, INGEST_DEFAULTS.chunkWords, INGEST_DEFAULTS.chunkOverlap);
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

      // Subjects
      for (const subj of subjects) {
        const subjectId = await ensureSubject(client, subj, subj);
        await linkPaperSubject(client, id, subjectId);
      }

      // Authors
      for (const [idx, authorName] of authors.entries()) {
        const authorId = await ensureAuthor(client, authorName);
        await linkPaperAuthor(client, id, authorId, idx + 1);
      }

      processed += 1;
      if (processed % every === 0) {
        // eslint-disable-next-line no-console
        console.log('[ingest][crossref] progress', { processed, totalFetched: items.length });
      }
    }
    return processed;
  } finally {
    client.release();
  }
}

export async function runCrossrefIngest(options: IngestRunOptions): Promise<IngestRunResult> {
  await pause(options.pacingMs);
  const items = await fetchCrossref(options.query, options.quantity);
  const processed = await upsert(items);

  return {
    fetched: items.length,
    processed,
    source: 'crossref'
  };
}

async function main() {
  const argsSchema = z.object({
    query: z.string().min(1).default(CLI_DEFAULTS.crossrefQuery),
    rows: z.coerce.number().int().positive().max(1000).default(CLI_DEFAULTS.crossrefRows)
  });
  const args = argsSchema.parse({ query: process.argv[2], rows: process.argv[3] });
  await runCrossrefIngest({
    query: args.query,
    quantity: args.rows,
    pacingMs: INGEST_RATE_LIMIT.sources.crossref.requestDelayMs
  });
}

if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('ingestCrossref failed', err);
      process.exit(1);
    })
    .finally(async () => {
      await closePool();
    });
}
