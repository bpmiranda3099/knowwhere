import { FastifyInstance } from 'fastify';
import { query } from '../../db/db';
import { config } from '../../config/env';

type Service = 'api' | 'db' | 'embedding' | 'reranker' | 'web';

async function checkDb() {
  try {
    await query('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkHttp(url?: string) {
  if (!url) return 'unknown';
  try {
    const res = await fetch(url);
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (req) => {
    const rawQuery = (req.query as Record<string, string | undefined>) ?? {};
    const params = new URLSearchParams(
      Object.entries(rawQuery)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, v as string])
    );
    const servicesParam = params.get('services');
    const requested: Service[] = servicesParam
      ? servicesParam.split(',').map((s) => s.trim() as Service)
      : ['api', 'db', 'embedding', 'reranker', 'web'];

    const checks: Record<Service, string> = {
      api: 'ok',
      db: 'unknown',
      embedding: 'unknown',
      reranker: 'unknown',
      web: 'unknown'
    };

    if (requested.includes('db')) {
      checks.db = await checkDb();
    }
    if (requested.includes('embedding')) {
      checks.embedding = await checkHttp(`${config.EMBEDDING_ENDPOINT?.replace(/\/embed$/, '')}/health`);
    }
    if (requested.includes('reranker') && config.RERANK_ENDPOINT) {
      checks.reranker = await checkHttp(`${config.RERANK_ENDPOINT?.replace(/\/rerank$/, '')}/health`);
    }
    if (requested.includes('web')) {
      // No internal web health; mark unknown
      checks.web = 'unknown';
    }

    return { status: 'ok', services: checks };
  });

  app.get('/ready', async () => ({ status: 'ready' }));
}
