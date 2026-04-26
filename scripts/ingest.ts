import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFile } from 'node:fs/promises';
import { INGEST_RATE_LIMIT } from '../src/config/ingest/constants';
import { defaultIngestTopicsStateFile, writeTopicIngestStateFile } from '../src/config/ingest/stateFile';
import { closePool } from '../src/db/db';
import { runArxivIngest } from './ingest/ingestArxiv';
import { runCrossrefIngest } from './ingest/ingestCrossref';
import { runOpenAlexIngest } from './ingest/ingestOpenAlex';
import { buildIngestSummary, IngestRunRequest, IngestSource, runSelectedIngest } from './ingest/shared';
import { ARXIV_CORE_QUERIES, CORE_TOPICS, CORE_TOPIC_GROUPS } from './ingest/topics/coreTopics';

const SOURCE_OPTIONS: Array<{ label: string; value: IngestSource }> = [
  { label: 'arXiv', value: 'arxiv' },
  { label: 'Crossref', value: 'crossref' },
  { label: 'OpenAlex', value: 'openalex' }
];

type IngestMode = 'single' | 'topics';

type TopicStateV1 = {
  version: 1;
  sources: Array<'arxiv' | 'crossref' | 'openalex'>;
  target: number;
  perTopic: number;
  startedAt: string;
  updatedAt: string;
  fetchedTotal: number;
  processedTotal: number;
  completedKeys: string[];
  failuresByKey: Record<string, { count: number; lastError: string; lastAt: string }>;
};

function getPacingMs(source: IngestSource): number {
  return INGEST_RATE_LIMIT.sources[source].requestDelayMs;
}

function printOptions(): void {
  for (const [index, option] of SOURCE_OPTIONS.entries()) {
    output.write(`${index + 1}. ${option.label}\n`);
  }
}

function printModeOptions(): void {
  output.write('1. Single query ingest\n');
  output.write('2. Ingest ALL core topics (same list as ingest:topics)\n');
}

function parseModeSelection(raw: string): IngestMode {
  const v = raw.trim();
  if (v === '1') return 'single';
  if (v === '2') return 'topics';
  throw new Error('Please choose 1 or 2.');
}

function parseSourceSelection(raw: string): IngestSource {
  const selected = SOURCE_OPTIONS[Number(raw.trim()) - 1];
  if (!selected) {
    throw new Error('Please choose 1, 2, or 3.');
  }
  return selected.value;
}

function parseQuantity(raw: string): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Quantity must be a positive whole number.');
  }
  return value;
}

function parsePositiveInt(raw: string, label: string): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return value;
}

function parseYesNo(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes') return true;
  if (normalized === 'n' || normalized === 'no' || normalized === '') return false;
  throw new Error('Please answer y or n.');
}

async function askQuestion(prompt: string, rl: ReturnType<typeof createInterface>): Promise<string> {
  const answer = await rl.question(prompt);
  return answer.trim();
}

async function promptUntilValid<T>(
  prompt: string,
  rl: ReturnType<typeof createInterface>,
  parser: (value: string) => T
): Promise<T> {
  while (true) {
    try {
      const answer = await askQuestion(prompt, rl);
      return parser(answer);
    } catch (error) {
      output.write(`${(error as Error).message}\n`);
    }
  }
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

function summarizeTopics() {
  return CORE_TOPIC_GROUPS.map((g) => `- ${g.group}: ${g.topics.length}`).join('\n');
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

type TopicRunConfig = {
  sources: Array<'arxiv' | 'crossref' | 'openalex'>;
  target: number;
  perTopic: number;
  resume: boolean;
  stateFile: string;
  maxRetriesPerTopic: number;
  backoffBaseMs: number;
};

async function collectTopicRunConfig(rl: ReturnType<typeof createInterface>): Promise<TopicRunConfig | null> {
  output.write('\nIngest ALL core topics\n');
  output.write('This uses the same topic list as ingest:topics.\n');
  output.write('Topic groups:\n' + summarizeTopics() + '\n');

  const sourcesRaw = await promptUntilValid(
    'Sources [arxiv,crossref,openalex] (comma-separated): ',
    rl,
    (v) => v.trim()
  );
  const sources =
    (sourcesRaw || 'arxiv,crossref,openalex')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .filter((s): s is 'arxiv' | 'crossref' | 'openalex' => s === 'arxiv' || s === 'crossref' || s === 'openalex');
  if (sources.length === 0) {
    output.write('No valid sources selected; defaulting to arxiv,crossref,openalex.\n');
    sources.push('arxiv', 'crossref', 'openalex');
  }

  const target = await promptUntilValid('Target total processed [100000]: ', rl, (v) =>
    v.trim() ? parsePositiveInt(v, 'Target') : 100_000
  );
  const perTopic = await promptUntilValid('Per-topic quantity [250]: ', rl, (v) =>
    v.trim() ? parsePositiveInt(v, 'Per-topic quantity') : 250
  );
  const defaultSf = defaultIngestTopicsStateFile();
  const stateFile = await promptUntilValid(`State file [${defaultSf}]: `, rl, (v) => (v.trim() ? v.trim() : defaultSf));
  const resume = await promptUntilValid('Resume from state file? [Y/n]: ', rl, (v) => {
    const normalized = v.trim().toLowerCase();
    if (normalized === '' || normalized === 'y' || normalized === 'yes') return true;
    if (normalized === 'n' || normalized === 'no') return false;
    throw new Error('Please answer y or n.');
  });
  const maxRetriesPerTopic = await promptUntilValid('Max retries per topic [3]: ', rl, (v) =>
    v.trim() ? parsePositiveInt(v, 'Max retries per topic') : 3
  );
  const backoffBaseMs = await promptUntilValid('Backoff base ms [2000]: ', rl, (v) =>
    v.trim() ? parsePositiveInt(v, 'Backoff base ms') : 2000
  );

  output.write('\nRun summary\n');
  output.write(
    [
      `Sources: ${sources.join(',')}`,
      `Target processed: ${fmt(target)}`,
      `Per-topic quantity: ${fmt(perTopic)}`,
      `State file: ${stateFile}`,
      `Resume: ${resume}`,
      `Max retries/topic: ${maxRetriesPerTopic}`,
      `Backoff base: ${backoffBaseMs}ms`
    ].join('\n') + '\n'
  );

  const confirmation = await promptUntilValid('Continue? [y/N]: ', rl, parseYesNo);
  if (!confirmation) {
    output.write('Ingest cancelled.\n');
    return null;
  }

  return {
    sources,
    target,
    perTopic,
    resume,
    stateFile,
    maxRetriesPerTopic,
    backoffBaseMs
  };
}

async function runTopicIngest(config: TopicRunConfig): Promise<void> {
  const existing = config.resume ? await readState(config.stateFile) : null;
  const state: TopicStateV1 =
    existing ??
    {
      version: 1,
      sources: config.sources,
      target: config.target,
      perTopic: config.perTopic,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      fetchedTotal: 0,
      processedTotal: 0,
      completedKeys: [],
      failuresByKey: {}
    };

  output.write(
    '\n' +
      [
        '[ingest] starting core-topics run',
        `target=${fmt(state.target)}`,
        `perTopic=${fmt(state.perTopic)}`,
        `sources=${state.sources.join(',')}`,
        `resume=${config.resume}`
      ].join(' ') +
      '\n'
  );

  const startedAtMs = Date.now();
  for (const source of state.sources) {
    if (state.processedTotal >= state.target) break;
    const queries = source === 'arxiv' ? ARXIV_CORE_QUERIES : CORE_TOPICS;

    for (const query of queries) {
      if (state.processedTotal >= state.target) break;
      const key = `${source}:${query}`;
      if (state.completedKeys.includes(key)) continue;

      output.write(`[ingest] ingest key="${key}" processed=${fmt(state.processedTotal)}/${fmt(state.target)}\n`);

      let attempt = 0;
      let result: { fetched: number; processed: number } | null = null;
      while (attempt <= config.maxRetriesPerTopic) {
        const topicStartMs = Date.now();
        const heartbeat = setInterval(() => {
          output.write(
            `[ingest] working key="${key}" elapsed=${Math.round((Date.now() - topicStartMs) / 1000)}s totalProcessed=${fmt(
              state.processedTotal
            )}/${fmt(state.target)}\n`
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
          } else if (source === 'crossref') {
            const r = await runCrossrefIngest({
              query,
              quantity: Math.max(1, Math.min(1000, state.perTopic)),
              pacingMs: INGEST_RATE_LIMIT.sources.crossref.requestDelayMs
            });
            result = { fetched: r.fetched, processed: r.processed };
          } else {
            const r = await runOpenAlexIngest({
              query,
              quantity: Math.max(1, Math.min(5000, state.perTopic)),
              pacingMs: INGEST_RATE_LIMIT.sources.openalex.requestDelayMs
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
          await writeState(config.stateFile, state);

          output.write(
            `[ingest] key failed key="${key}" attempt=${attempt + 1}/${config.maxRetriesPerTopic + 1} err=${message}\n`
          );

          if (attempt === config.maxRetriesPerTopic) break;
          const delay = message.includes('HTTP 429') ? 60_000 : config.backoffBaseMs * 2 ** attempt;
          await sleep(delay);
        }
        attempt += 1;
      }

      if (!result) {
        output.write(`[ingest] skipping key after retries key="${key}"\n`);
        continue;
      }

      state.fetchedTotal += result.fetched;
      state.processedTotal += result.processed;
      state.completedKeys.push(key);
      state.updatedAt = nowIso();
      await writeState(config.stateFile, state);

      const elapsedMs = Date.now() - startedAtMs;
      const rate = state.processedTotal > 0 ? state.processedTotal / Math.max(1, elapsedMs / 1000) : 0;
      const remaining = Math.max(0, state.target - state.processedTotal);
      const etaSec = rate > 0 ? Math.round(remaining / rate) : null;

      output.write(
        [
          `[ingest] done key="${key}"`,
          `fetched=${fmt(result.fetched)}`,
          `processed=${fmt(result.processed)}`,
          `totalProcessed=${fmt(state.processedTotal)}`,
          etaSec ? `eta~${Math.round(etaSec / 60)}m` : 'eta~unknown'
        ].join(' ') + '\n'
      );
    }
  }

  output.write(
    `[ingest] finished processed=${fmt(state.processedTotal)}/${fmt(state.target)} keysDone=${state.completedKeys.length}\n`
  );
}

async function main(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    output.write('\nInteractive ingest\n');
    output.write('Choose a mode:\n');
    printModeOptions();
    const mode = await promptUntilValid('Select mode [1-2]: ', rl, parseModeSelection);

    if (mode === 'single') {
      output.write('Choose a source:\n');
      printOptions();

      const source = await promptUntilValid('Select source [1-3]: ', rl, parseSourceSelection);
      const query = await promptUntilValid('Query: ', rl, (value) => {
        if (!value.trim()) {
          throw new Error('Query is required.');
        }
        return value.trim();
      });
      const quantity = await promptUntilValid('Quantity: ', rl, parseQuantity);

      const request: IngestRunRequest = {
        source,
        query,
        quantity,
        pacingMs: getPacingMs(source)
      };

      output.write('\nRun summary\n');
      output.write(`${buildIngestSummary(request)}\n`);

      const confirmation = await promptUntilValid('Continue? [y/N]: ', rl, parseYesNo);
      if (!confirmation) {
        output.write('Ingest cancelled.\n');
        return;
      }

      output.write(`\nStarting ${request.source} ingest...\n`);
      const result = await runSelectedIngest(request, {
        arxiv: runArxivIngest,
        crossref: runCrossrefIngest,
        openalex: runOpenAlexIngest
      });

      output.write('\nIngest complete\n');
      output.write(`Source: ${result.source}\n`);
      output.write(`Fetched: ${result.fetched}\n`);
      output.write(`Processed: ${result.processed}\n`);
      return;
    }

    const cfg = await collectTopicRunConfig(rl);
    if (!cfg) return;
    await runTopicIngest(cfg);
  } finally {
    rl.close();
    await closePool();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('interactive ingest failed', error);
  process.exit(1);
});
