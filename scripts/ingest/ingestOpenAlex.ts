import { closePool, getClient } from '../../src/db/db';
import { embedText } from '../../src/services/embeddingClient';
import { chunkText } from '../utils/chunk';
import { fetchWithRetry } from '../utils/retry';
import { fetchPdfText } from '../utils/pdf';
import { CLI_DEFAULTS, SOURCES, USER_AGENT, INGEST_DEFAULTS, INGEST_RATE_LIMIT } from '../../src/config/ingest/constants';
import { z } from 'zod';
import { pause } from '../utils/rateLimit';
import {
  ensureAuthor,
  ensureSource,
  ensureSubject,
  ensureVenue,
  linkPaperAuthor,
  linkPaperSubject
} from '../utils/ingestDb';

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

async function fetchOpenAlex(query: string, perPage = 20): Promise<OpenAlexWork[]> {
  const url = `${SOURCES.OPENALEX_API}?search=${encodeURIComponent(query)}&per-page=${perPage}`;
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
  const json = await res.json();
  return json.results as OpenAlexWork[];
}

async function upsert(items: OpenAlexWork[]) {
  const client = await getClient();
  try {
    const sourceId = await ensureSource(client, 'openalex', 'https://api.openalex.org/works');
    for (const item of items) {
      await pause(INGEST_RATE_LIMIT.perRequestDelayMs);
      const id = item.doi ?? item.id;
      if (!id) continue;
      const title = item.display_name ?? '';
      const abstract = decodeAbstract(item.abstract_inverted_index);
      const year = item.publication_year ?? null;
      const venue = item.primary_location?.source?.display_name ?? null;
      const url = item.primary_location?.landing_page_url ?? item.primary_location?.pdf_url ?? null;
      const subjects =
        item.topics?.map((t) => t.topic?.display_name).filter(Boolean) as string[] | undefined;
      const authors =
        item.authorships?.map((a) => a.author?.display_name).filter(Boolean) as string[] | undefined;
      const pdfUrl = item.primary_location?.pdf_url;
      const pdfText = pdfUrl ? await fetchPdfText(pdfUrl) : null;
      const content = pdfText && pdfText.length > abstract.length ? pdfText : abstract || title;
      const venueId = await ensureVenue(client, venue);

      const embedding = await embedText(`${title}\n${content}`);
      const embeddingLiteral = `[${embedding.join(',')}]`;

      await client.query(
        `
        INSERT INTO papers (id, title, abstract, authors, venue, venue_id, year, doi, url, subjects, source, source_id, language_code, license, embedding, tsv)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'openalex', $10, $11, $12, $13, $14,
          to_tsvector('english', coalesce($2,'') || ' ' || coalesce($3,'')))
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          abstract = EXCLUDED.abstract,
          authors = EXCLUDED.authors,
          venue = EXCLUDED.venue,
          venue_id = EXCLUDED.venue_id,
          year = EXCLUDED.year,
          doi = EXCLUDED.doi,
          url = EXCLUDED.url,
          subjects = EXCLUDED.subjects,
          source = EXCLUDED.source,
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
          authors ?? [],
          venue,
          venueId,
          year,
          item.doi ?? null,
          url,
          subjects ?? [],
          embeddingLiteral,
          sourceId,
          item.language ?? null,
          null
        ]
      );

      const chunks = chunkText(content || title, INGEST_DEFAULTS.chunkWords, INGEST_DEFAULTS.chunkOverlap);
      for (const chunk of chunks) {
        const chunkEmbedding = await embedText(chunk);
        const chunkLiteral = `[${chunkEmbedding.join(',')}]`;
        await client.query(
          `
          INSERT INTO paper_chunks (paper_id, chunk_text, chunk_embedding, tsv)
          VALUES ($1, $2, $3, to_tsvector('english', coalesce($2,'')))
          ON CONFLICT DO NOTHING;
          `,
          [id, chunk, chunkLiteral]
        );
      }

      if (subjects) {
        for (const subj of subjects) {
          const subjectId = await ensureSubject(client, subj, subj);
          await linkPaperSubject(client, id, subjectId);
        }
      }

      if (authors) {
        for (const [idx, authorName] of authors.entries()) {
          const authorId = await ensureAuthor(client, authorName);
          await linkPaperAuthor(client, id, authorId, idx + 1);
        }
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  const argsSchema = z.object({
    query: z.string().min(1).default(CLI_DEFAULTS.openalexQuery),
    perPage: z.coerce.number().int().positive().max(200).default(CLI_DEFAULTS.openalexPerPage)
  });
  const args = argsSchema.parse({ query: process.argv[2], perPage: process.argv[3] });

  const items = await fetchOpenAlex(args.query, args.perPage);
  await upsert(items);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('ingestOpenAlex failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
