import { closePool, getClient } from '../../src/db/db';
import { embedText } from '../../src/services/embeddingClient';
import { chunkText } from '../utils/chunk';
import { fetchWithRetry } from '../utils/retry';
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

// Minimal arXiv ingestion example (uses export API via HTTP).
// For production, add retries, backoff, and richer field mapping.

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  updated: string;
  published: string;
  link: string;
  doi?: string;
  categories: string[];
  authors: string[];
}

async function fetchArxiv(query: string, maxResults = 50): Promise<ArxivEntry[]> {
  const url = `${SOURCES.ARXIV_API}?search_query=${encodeURIComponent(query)}&start=0&max_results=${maxResults}`;
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
  const text = await res.text();

  // Very lightweight parsing to keep dependencies down; for production use an Atom parser.
  const entries: ArxivEntry[] = [];
  const entryBlocks = text.split('<entry>').slice(1);
  for (const block of entryBlocks) {
    const get = (tag: string) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
      const match = block.match(regex);
      return match ? match[1].trim().replace(/\s+/g, ' ') : '';
    };
    const getAll = (tag: string) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
      const vals: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(block))) vals.push(m[1].trim().replace(/\s+/g, ' '));
      return vals;
    };

    const id = get('id');
    const title = get('title');
    const summary = get('summary');
    const doiMatch = block.match(/<arxiv:doi>([^<]+)<\/arxiv:doi>/);
    const cats = Array.from(block.matchAll(/term="([^"]+)"/g)).map((m) => m[1]);
    const authors = getAll('name');
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/);

    entries.push({
      id,
      title,
      summary,
      updated: get('updated'),
      published: get('published'),
      link: linkMatch ? linkMatch[1] : id,
      doi: doiMatch ? doiMatch[1] : undefined,
      categories: cats,
      authors
    });
  }
  return entries;
}

async function upsertEntries(entries: ArxivEntry[]) {
  const client = await getClient();
  try {
    const sourceId = await ensureSource(client, 'arxiv', 'http://export.arxiv.org');
    for (const entry of entries) {
      await pause(INGEST_RATE_LIMIT.perRequestDelayMs);
      const venueId = await ensureVenue(client, null);
      const embedding = await embedText(`${entry.title}\n${entry.summary}`);
      const embeddingLiteral = `[${embedding.join(',')}]`;
      await client.query(
        `
        INSERT INTO papers (id, title, abstract, authors, venue, venue_id, year, doi, url, subjects, source, source_id, language_code, license, embedding, tsv)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'arxiv', $11, $12, $13, $14::vector,
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
          entry.id,
          entry.title,
          entry.summary,
          entry.authors,
          null,
          venueId,
          entry.published ? Number(entry.published.slice(0, 4)) : null,
          entry.doi ?? null,
          entry.link,
          entry.categories,
          sourceId,
          null,
          null,
          embeddingLiteral
        ]
      );

      const chunks = chunkText(entry.summary || entry.title || '', INGEST_DEFAULTS.chunkWords, INGEST_DEFAULTS.chunkOverlap);
      for (const [idx, chunk] of chunks.entries()) {
        const chunkEmbedding = await embedText(chunk);
        const chunkLiteral = `[${chunkEmbedding.join(',')}]`;
        await client.query(
          `
          INSERT INTO paper_chunks (paper_id, chunk_text, chunk_embedding, tsv)
          VALUES ($1, $2, $3::vector, to_tsvector('english', coalesce($2,'')))
          ON CONFLICT DO NOTHING;
          `,
          [entry.id, chunk, chunkLiteral]
        );
      }

      // Subjects (taxonomy)
      for (const cat of entry.categories) {
        const subjectId = await ensureSubject(client, cat, cat);
        await linkPaperSubject(client, entry.id, subjectId);
      }

      // Authors
      for (const [idx, authorName] of entry.authors.entries()) {
        const authorId = await ensureAuthor(client, authorName);
        await linkPaperAuthor(client, entry.id, authorId, idx + 1);
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  const argsSchema = z.object({
    query: z.string().min(1).default(CLI_DEFAULTS.arxivQuery),
    maxResults: z.coerce.number().int().positive().max(2000).default(CLI_DEFAULTS.arxivMaxResults)
  });
  const args = argsSchema.parse({ query: process.argv[2], maxResults: process.argv[3] });

  const entries = await fetchArxiv(args.query, args.maxResults);
  await upsertEntries(entries);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('ingestArxiv failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
