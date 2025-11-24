import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../../db/db';
import { search } from '../../services/searchService';
import { Level, Mode, SearchFilters, SearchResult } from '../../types';

const filtersSchema = z
  .object({
    yearFrom: z.number().int().optional(),
    yearTo: z.number().int().optional(),
    venue: z.string().max(128).optional(),
    subject: z.string().max(64).optional(),
    source: z.string().max(64).optional()
  })
  .optional();

const evaluateSchema = z.object({
  label: z.string().max(128).optional(),
  notes: z.string().max(1000).optional(),
  k: z.number().int().positive().max(50).default(10),
  modes: z.array(z.enum(['lexical', 'semantic', 'hybrid'])).min(1).max(3).optional(),
  level: z.enum(['paper', 'chunk']).optional(),
  queries: z
    .array(
      z.object({
        id: z.string().max(64).optional(),
        q: z.string().min(1),
        relevantIds: z.array(z.string()).min(1),
        filters: filtersSchema
      })
    )
    .min(1)
});

type EvalLog = {
  runId: number;
  mode: Mode;
  query: string;
  relevantIds: string[];
  retrievedIds: string[];
  metrics: {
    precision: number;
    recall: number;
    mrr: number;
  };
  latencyMs: number;
};

function computeMetrics(retrieved: string[], relevant: Set<string>, k: number) {
  const relHits = retrieved.filter((id) => relevant.has(id));
  const precision = relHits.length / k;
  const recall = relevant.size > 0 ? relHits.length / relevant.size : 0;
  let mrr = 0;
  for (let i = 0; i < retrieved.length; i += 1) {
    if (relevant.has(retrieved[i])) {
      mrr = 1 / (i + 1);
      break;
    }
  }
  return { precision, recall, mrr };
}

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id serial PRIMARY KEY,
      label text,
      notes text,
      modes text[],
      k integer NOT NULL,
      level text NOT NULL,
      metrics jsonb,
      created_at timestamptz DEFAULT now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS evaluation_logs (
      id serial PRIMARY KEY,
      run_id integer REFERENCES evaluation_runs(id) ON DELETE CASCADE,
      mode text NOT NULL,
      query text NOT NULL,
      relevant_ids text[] NOT NULL,
      retrieved_ids text[] NOT NULL,
      metrics jsonb,
      latency_ms numeric,
      created_at timestamptz DEFAULT now()
    );
  `);
}

export async function registerEvaluateRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/evaluate',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = evaluateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const payload = parsed.data;
      const k = payload.k;
      const level: Level = payload.level ?? 'paper';
      const modes: Mode[] = (payload.modes as Mode[] | undefined) ?? ['hybrid', 'lexical', 'semantic'];

      await ensureTables();

      const metricsByMode: Record<
        Mode,
        { precision: number; recall: number; mrr: number; latencyMs: number; count: number }
      > = {
        hybrid: { precision: 0, recall: 0, mrr: 0, latencyMs: 0, count: 0 },
        lexical: { precision: 0, recall: 0, mrr: 0, latencyMs: 0, count: 0 },
        semantic: { precision: 0, recall: 0, mrr: 0, latencyMs: 0, count: 0 }
      };

      const logs: EvalLog[] = [];

      for (const mode of modes) {
        for (const q of payload.queries) {
          if (q.filters?.yearFrom && q.filters?.yearTo && q.filters.yearFrom > q.filters.yearTo) {
            return reply.status(400).send({ error: 'yearFrom cannot be greater than yearTo' });
          }
          const started = Date.now();
          const results: SearchResult[] = await search({
            q: q.q,
            limit: k,
            level,
            mode,
            filters: q.filters as SearchFilters | undefined
          });
          const latencyMs = Date.now() - started;
          const retrievedIds = results.map((r) => r.id).slice(0, k);
          const relevantSet = new Set(q.relevantIds);
          const metrics = computeMetrics(retrievedIds, relevantSet, k);

          const bucket = metricsByMode[mode];
          bucket.precision += metrics.precision;
          bucket.recall += metrics.recall;
          bucket.mrr += metrics.mrr;
          bucket.latencyMs += latencyMs;
          bucket.count += 1;

          logs.push({
            runId: -1,
            mode,
            query: q.q,
            relevantIds: q.relevantIds,
            retrievedIds,
            metrics,
            latencyMs
          });
        }
      }

      const aggregated = Object.fromEntries(
        Object.entries(metricsByMode).map(([mode, vals]) => {
          const count = vals.count || 1;
          return [
            mode,
            {
              precision: vals.precision / count,
              recall: vals.recall / count,
              mrr: vals.mrr / count,
              latencyMs: vals.latencyMs / count,
              queries: vals.count
            }
          ];
        })
      );

      const { rows } = await query<{ id: number }>(
        `INSERT INTO evaluation_runs (label, notes, modes, k, level, metrics)
         VALUES ($1, $2, $3::text[], $4, $5, $6::jsonb)
         RETURNING id;`,
        [payload.label ?? 'ad-hoc', payload.notes ?? null, modes, k, level, aggregated]
      );
      const runId = rows[0].id;

      for (const log of logs) {
        await query(
          `INSERT INTO evaluation_logs (run_id, mode, query, relevant_ids, retrieved_ids, metrics, latency_ms)
           VALUES ($1, $2, $3, $4::text[], $5::text[], $6::jsonb, $7);`,
          [runId, log.mode, log.query, log.relevantIds, log.retrievedIds, log.metrics, log.latencyMs]
        );
      }

      // include a small sample of logs in response
      const sample = logs.slice(0, 5).map((l) => ({ ...l, runId }));
      return reply.status(202).send({ runId, metrics: aggregated, sample });
    }
  );
}
