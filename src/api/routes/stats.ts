import { FastifyInstance } from 'fastify';
import { query } from '../../db/db';

interface StatsRow {
  papers: number;
  chunks: number;
  subjects: number;
  sources: number;
}

export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stats', async (_req, reply) => {
    const { rows } = await query<StatsRow>(`
      SELECT
        (SELECT count(*) FROM papers)   AS papers,
        (SELECT count(*) FROM paper_chunks) AS chunks,
        (SELECT count(*) FROM subjects) AS subjects,
        (SELECT count(*) FROM sources)  AS sources;
    `);
    return reply.send(rows[0] ?? { papers: 0, chunks: 0, subjects: 0, sources: 0 });
  });
}
