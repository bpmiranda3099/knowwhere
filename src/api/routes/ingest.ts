import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ingestSchema = z.object({
  source: z.enum(['arxiv', 'crossref', 'openalex']),
  query: z.string().min(1),
  count: z.coerce.number().int().positive().max(500).default(50)
});

const SCRIPT_MAP: Record<string, string> = {
  arxiv: 'ingestArxiv.js',
  crossref: 'ingestCrossref.js',
  openalex: 'ingestOpenAlex.js'
};

export async function registerIngestRoutes(app: FastifyInstance): Promise<void> {
  app.post('/ingest', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { source, query, count } = parsed.data;
    const scriptFile = SCRIPT_MAP[source];
    const scriptPath = path.join(process.cwd(), 'dist', 'scripts', 'ingest', scriptFile);

    if (!fs.existsSync(scriptPath)) {
      return reply.status(500).send({ error: `Ingest script not found: ${scriptFile}` });
    }

    const child = spawn('node', [scriptPath, query, String(count)], {
      stdio: 'inherit'
    });

    child.on('exit', (code) => {
      const status = code === 0 ? 'completed' : `failed (code ${code})`;
      app.log.info({ source, query, count, status }, 'ingest job finished');
    });

    return reply.status(202).send({
      message: 'Ingest started',
      source,
      query,
      count,
      pid: child.pid
    });
  });
}
