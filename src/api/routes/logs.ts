import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../../db/db';

const logsSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50)
});

interface LogRow {
  id: number;
  query: string | null;
  result_count: number | null;
  duration_ms: number | null;
  created_at: string;
}

export async function registerLogsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/logs', async (req, reply) => {
    const parsed = logsSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { limit } = parsed.data;
    const { rows } = await query<LogRow>(
      `
      SELECT id, query, result_count, duration_ms, created_at
      FROM search_logs
      ORDER BY created_at DESC
      LIMIT $1;
      `,
      [limit]
    );
    return reply.send({ logs: rows });
  });
}
