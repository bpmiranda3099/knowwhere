import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ARXIV_CORE_QUERIES, CORE_TOPICS, CORE_TOPIC_GROUPS } from './ingest/topics/coreTopics';
import { defaultIngestTopicsStateFile, writeTopicIngestStateFile } from '../src/config/ingest/stateFile';
import { INGEST_RATE_LIMIT } from '../src/config/ingest/constants';
import { closePool } from '../src/db/db';
import { runArxivIngest } from './ingest/ingestArxiv';
import { runCrossrefIngest } from './ingest/ingestCrossref';

type TopicStateV1 = {
  version: 1;
  sources: Array<'arxiv' | 'crossref'>;
  target: number;
  perTopic: number;
  startedAt: string;
  updatedAt: string;
  fetchedTotal: number;
  processedTotal: number;
  completedKeys: string[];
  failuresByKey: Record<string, { count: number; lastError: string; lastAt: string }>;
};

const argsSchema = z.object({
  target: z.coerce.number().int().positive().default(100_000),
  perTopic: z.coerce.number().int().positive().max(2000).default(250),
  sources: z
    .string()
    .default('arxiv,crossref')
    .transform((v) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.enum(['arxiv', 'crossref']))),
  resume: z.coerce.boolean().default(true),
  dryRun: z.coerce.boolean().default(false),
  stateFile: z.string().min(1),
  maxRetriesPerTopic: z.coerce.number().int().nonnegative().max(10).default(3),
  backoffBaseMs: z.coerce.number().int().positive().default(2000)
});

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx === -1 ? undefined : argv[idx + 1];
  };
  const has = (flag: string) => argv.includes(flag);
  const stateFromFlag = get('--stateFile')?.trim();
  return argsSchema.parse({
    target: get('--target'),
    perTopic: get('--perTopic'),
    sources: get('--sources'),
    stateFile: stateFromFlag && stateFromFlag.length > 0 ? stateFromFlag : defaultIngestTopicsStateFile(),
    resume: has('--no-resume') ? false : has('--resume') ? true : undefined,
    dryRun: has('--dryRun'),
    maxRetriesPerTopic: get('--maxRetriesPerTopic'),
    backoffBaseMs: get('--backoffBaseMs')
  });
}

async function readState(path: string): Promise<TopicStateV1 | null> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as TopicStateV1;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeState(path: string, state: TopicStateV1): Promise<void> {
  await writeTopicIngestStateFile(path, state);
}

function nowIso() {
  return new Date().toISOString();
}

function fmt(n: number) {
  return n.toLocaleString('en-US');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortErr(err: unknown) {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m${r.toString().padStart(2, '0')}s` : `${r}s`;
}

function summarizeTopics() {
  return CORE_TOPIC_GROUPS.map((g) => `- ${g.group}: ${g.topics.length}`).join('\n');
}

async function main() {
  const args = parseArgs();
  const existing = args.resume ? await readState(args.stateFile) : null;
  const state: TopicStateV1 =
    existing ??
    {
      version: 1,
      sources: args.sources,
      target: args.target,
      perTopic: args.perTopic,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      fetchedTotal: 0,
      processedTotal: 0,
      completedKeys: [],
      failuresByKey: {}
    };

  // eslint-disable-next-line no-console
  console.log(
    [
      '[ingestTopics] starting',
      `target=${fmt(state.target)}`,
      `perTopic=${fmt(state.perTopic)}`,
      `sources=${state.sources.join(',')}`,
      `resume=${args.resume}`,
      `stateFile=${resolve(args.stateFile)}`
    ].join(' ')
  );
  // eslint-disable-next-line no-console
  console.log('[ingestTopics] topic groups:\n' + summarizeTopics());

  if (args.dryRun) {
    // eslint-disable-next-line no-console
    console.log('[ingestTopics] dryRun enabled; previewing remaining keys:');
    const preview: string[] = [];
    for (const source of state.sources) {
      const queries = source === 'arxiv' ? ARXIV_CORE_QUERIES : CORE_TOPICS;
      for (const query of queries) {
        const key = `${source}:${query}`;
        if (state.completedKeys.includes(key)) continue;
        preview.push(key);
        if (preview.length >= 200) break;
      }
      if (preview.length >= 200) break;
    }
    preview.forEach((k, i) => console.log(`${i + 1}. ${k}`));
    return;
  }

  const startedAtMs = Date.now();
  for (const source of state.sources) {
    if (state.processedTotal >= state.target) break;
    const queries = source === 'arxiv' ? ARXIV_CORE_QUERIES : CORE_TOPICS;

    for (const query of queries) {
      if (state.processedTotal >= state.target) break;
      const key = `${source}:${query}`;
      if (state.completedKeys.includes(key)) continue;

      // eslint-disable-next-line no-console
      console.log(`[ingestTopics] ingest key="${key}" processed=${fmt(state.processedTotal)}/${fmt(state.target)}`);

      let attempt = 0;
      let result: { fetched: number; processed: number } | null = null;
      while (attempt <= args.maxRetriesPerTopic) {
        const topicStartMs = Date.now();
        const heartbeat = setInterval(() => {
          // eslint-disable-next-line no-console
          console.log(
            `[ingestTopics] working key="${key}" elapsed=${formatDuration(Date.now() - topicStartMs)} totalProcessed=${fmt(
              state.processedTotal
            )}/${fmt(state.target)}`
          );
        }, 30_000);

        try {
          if (source === 'arxiv') {
            const r = await runArxivIngest({
              query,
              quantity: Math.max(1, Math.min(2000, state.perTopic)),
              pacingMs: INGEST_RATE_LIMIT.sources.arxiv.requestDelayMs
            });
            result = { fetched: r.fetched, processed: r.processed };
          } else {
            const r = await runCrossrefIngest({
              query,
              quantity: Math.max(1, Math.min(1000, state.perTopic)),
              pacingMs: INGEST_RATE_LIMIT.sources.crossref.requestDelayMs
            });
            result = { fetched: r.fetched, processed: r.processed };
          }
          clearInterval(heartbeat);
          break;
        } catch (err) {
          clearInterval(heartbeat);
          const message = shortErr(err);
          const prev = state.failuresByKey[key]?.count ?? 0;
          state.failuresByKey[key] = { count: prev + 1, lastError: message, lastAt: nowIso() };
          state.updatedAt = nowIso();
          await writeState(args.stateFile, state);

          // eslint-disable-next-line no-console
          console.error(
            `[ingestTopics] key failed key="${key}" attempt=${attempt + 1}/${args.maxRetriesPerTopic + 1} err=${message}`
          );

          if (attempt === args.maxRetriesPerTopic) break;
          const delay = message.includes('HTTP 429') ? 60_000 : args.backoffBaseMs * 2 ** attempt;
          await sleep(delay);
        }
        attempt += 1;
      }

      if (!result) {
        // eslint-disable-next-line no-console
        console.error(`[ingestTopics] skipping key after retries key="${key}"`);
        continue;
      }

      state.fetchedTotal += result.fetched;
      state.processedTotal += result.processed;
      state.completedKeys.push(key);
      state.updatedAt = nowIso();
      await writeState(args.stateFile, state);

      const elapsedMs = Date.now() - startedAtMs;
      const rate = state.processedTotal > 0 ? state.processedTotal / Math.max(1, elapsedMs / 1000) : 0;
      const remaining = Math.max(0, state.target - state.processedTotal);
      const etaSec = rate > 0 ? Math.round(remaining / rate) : null;

      // eslint-disable-next-line no-console
      console.log(
        [
          `[ingestTopics] done key="${key}"`,
          `fetched=${fmt(result.fetched)}`,
          `processed=${fmt(result.processed)}`,
          `totalProcessed=${fmt(state.processedTotal)}`,
          etaSec ? `eta~${Math.round(etaSec / 60)}m` : 'eta~unknown'
        ].join(' ')
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[ingestTopics] finished processed=${fmt(state.processedTotal)}/${fmt(state.target)} keysDone=${state.completedKeys.length}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('ingestTopics failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });

