import { PoolClient } from 'pg';

export async function ensureSource(client: PoolClient, name: string, baseUrl?: string): Promise<number> {
  const existing = await client.query<{ id: number }>('SELECT id FROM sources WHERE name = $1 LIMIT 1', [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await client.query<{ id: number }>(
    'INSERT INTO sources (name, base_url) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET base_url = EXCLUDED.base_url RETURNING id',
    [name, baseUrl ?? null]
  );
  return inserted.rows[0].id;
}

export async function ensureVenue(client: PoolClient, name?: string | null): Promise<number | null> {
  if (!name) return null;
  const existing = await client.query<{ id: number }>('SELECT id FROM venues WHERE name = $1 LIMIT 1', [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await client.query<{ id: number }>(
    'INSERT INTO venues (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [name]
  );
  return inserted.rows[0].id;
}

export async function ensureSubject(client: PoolClient, code: string, name?: string | null): Promise<number> {
  const existing = await client.query<{ id: number }>('SELECT id FROM subjects WHERE code = $1 LIMIT 1', [code]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await client.query<{ id: number }>(
    'INSERT INTO subjects (code, name) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name = COALESCE(EXCLUDED.name, subjects.name) RETURNING id',
    [code, name ?? code]
  );
  return inserted.rows[0].id;
}

export async function ensureAuthor(client: PoolClient, name: string, orcid?: string | null): Promise<number> {
  const existing = await client.query<{ id: number }>('SELECT id FROM authors WHERE name = $1 LIMIT 1', [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await client.query<{ id: number }>(
    'INSERT INTO authors (name, orcid) VALUES ($1, $2) RETURNING id',
    [name, orcid ?? null]
  );
  return inserted.rows[0].id;
}

export async function linkPaperSubject(client: PoolClient, paperId: string, subjectId: number): Promise<void> {
  await client.query(
    'INSERT INTO paper_subjects (paper_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [paperId, subjectId]
  );
}

export async function linkPaperAuthor(
  client: PoolClient,
  paperId: string,
  authorId: number,
  authorOrder?: number | null
): Promise<void> {
  await client.query(
    `
    INSERT INTO paper_authors (paper_id, author_id, author_order)
    VALUES ($1, $2, $3)
    ON CONFLICT (paper_id, author_id) DO UPDATE SET author_order = COALESCE(EXCLUDED.author_order, paper_authors.author_order)
    `,
    [paperId, authorId, authorOrder ?? null]
  );
}
