import { z } from 'zod';
import { closePool, getClient } from '../../src/db/db';
import { embedText } from '../../src/services/embeddingClient';
import { chunkText } from '../utils/chunk';
import { fetchPdfText } from '../utils/pdf';
import { pause } from '../utils/rateLimit';
import {
  ensureAuthor,
  ensureSource,
  ensureSubject,
  ensureVenue,
  linkPaperAuthor,
  linkPaperSubject
} from '../utils/ingestDb';
import { INGEST_DEFAULTS, INGEST_RATE_LIMIT, SOURCES, USER_AGENT } from '../../src/config/ingest/constants';

type CrossrefWork = {
  DOI: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string }>;
  issued?: { 'date-parts': number[][] };
  URL?: string;
  subject?: string[];
  'container-title'?: string[];
  link?: Array<{ URL?: string; 'content-type'?: string }>;
};

async function fetchWork(doi: string): Promise<CrossrefWork | null> {
  const url = `${SOURCES.CROSSREF_API}/${encodeURIComponent(doi)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`Fetch failed for ${doi}: ${res.status}`);
    return null;
  }
  const json = (await res.json()) as { message?: CrossrefWork };
  return json.message ?? null;
}

async function upsertWork(work: CrossrefWork, sourceId: number) {
  const client = await getClient();
  try {
    await pause(INGEST_RATE_LIMIT.perRequestDelayMs);
    const id = work.DOI ?? work.URL;
    if (!id) return;
    const title = work.title?.[0] ?? '';
    const abstract = work.abstract?.replace(/<[^>]+>/g, '') ?? '';
    const year = work.issued?.['date-parts']?.[0]?.[0] ?? null;
    const subjects = work.subject ?? [];
    const authors =
      work.author?.map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean) ?? [];
    const venue = work['container-title']?.[0] ?? null;
    const venueId = await ensureVenue(client, venue);
    const pdfUrl = work.link?.find?.((l) => l['content-type'] === 'application/pdf')?.URL;
    const pdfText = pdfUrl ? await fetchPdfText(pdfUrl) : null;
    const content = pdfText && pdfText.length > abstract.length ? pdfText : abstract || title;

    const embedding = await embedText(`${title}\n${content}`);
    const embeddingLiteral = `[${embedding.join(',')}]`;

    await client.query(
      `
      INSERT INTO papers (id, title, abstract, authors, venue, venue_id, year, doi, url, subjects, source, source_id, embedding, tsv)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'crossref', $11, $12::vector,
        to_tsvector('english', coalesce($2,'') || ' ' || coalesce($3,'')))
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        abstract = EXCLUDED.abstract,
        authors = EXCLUDED.authors,
        venue = EXCLUDED.venue,
        venue_id = EXCLUDED.venue_id,
        year = EXCLUDED.year,
        url = EXCLUDED.url,
        subjects = EXCLUDED.subjects,
        source = EXCLUDED.source,
        source_id = EXCLUDED.source_id,
        embedding = EXCLUDED.embedding,
        tsv = EXCLUDED.tsv;
      `,
      [id, title, abstract || content, authors, venue, venueId, year, work.DOI ?? null, work.URL ?? null, subjects, sourceId, embeddingLiteral]
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

    for (const subj of subjects) {
      const subjectId = await ensureSubject(client, subj, subj);
      await linkPaperSubject(client, id, subjectId);
    }
    for (const [idx, authorName] of authors.entries()) {
      const authorId = await ensureAuthor(client, authorName);
      await linkPaperAuthor(client, id, authorId, idx + 1);
    }
  } finally {
    client.release();
  }
}

async function main() {
  const argsSchema = z.object({
    dois: z.string().min(1)
  });
  const rawDois = process.argv.slice(2).join(',');
  const args = argsSchema.parse({ dois: rawDois });
  const dois = args.dois.split(',').map((d) => d.trim()).filter(Boolean);
  const sourceClient = await getClient();
  const sourceId = await ensureSource(sourceClient, 'crossref', SOURCES.CROSSREF_API);
  sourceClient.release();

  for (const doi of dois) {
    const work = await fetchWork(doi);
    if (!work) continue;
    await upsertWork(work, sourceId);
    // eslint-disable-next-line no-console
    console.log(`Ingested ${doi}`);
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('ingestDois failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
