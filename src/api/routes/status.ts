import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

type ServiceStatus = { name: string; status: 'ok' | 'warn' | 'fail'; detail?: string };

function safeFetch(url: string): Promise<Response | null> {
  return fetch(url, { method: 'GET' }).catch(() => null);
}

async function getServices() {
  const targets = [
    { name: 'api', url: 'http://localhost:3000/health' },
    { name: 'embedding', url: 'http://localhost:8081/health' },
    { name: 'reranker', url: 'http://localhost:8082/health' }
  ];

  const results: ServiceStatus[] = [];
  for (const t of targets) {
    const res = await safeFetch(t.url);
    if (!res) {
      results.push({ name: t.name, status: 'fail', detail: 'fetch failed' });
      continue;
    }
    if (!res.ok) {
      results.push({ name: t.name, status: 'warn', detail: `${res.status}` });
      continue;
    }
    const data = (await res.json()) as any;
    results.push({ name: t.name, status: 'ok', detail: data.model ?? data.status ?? 'ok' });
  }
  return results;
}

function loadLatestEval() {
  const dir = path.resolve('tests/phase2/results');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('phase2-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (!files[0]) return null;
  const raw = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  return JSON.parse(raw);
}

export async function registerStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async (_req, reply) => {
    const services = await getServices();
    const evalJson = loadLatestEval();
    let summary: any = null;
    if (evalJson?.summary) {
      summary = {
        acceptance: {
          precisionLift: evalJson.summary.gates?.details?.precisionLift,
          p95: evalJson.summary.gates?.details?.hybridLatencyP95,
          noisyDrop: evalJson.summary.gates?.details?.noisyDrop
        },
        aggregates: evalJson.summary.aggregates,
        latency: evalJson.summary.latency
      };
    }
    return reply.send({ services, eval: summary });
  });
}
