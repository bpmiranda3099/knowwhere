import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { performance } from 'node:perf_hooks';

type Mode = 'lexical' | 'semantic' | 'hybrid';
type Level = 'paper' | 'chunk';

type QueryBucket = 'keyword' | 'conceptual' | 'longtail' | 'noisy';

type SearchFilters = {
  yearFrom?: number;
  yearTo?: number;
  venue?: string;
  subject?: string;
  source?: string;
};

type Phase2Query = {
  id: string;
  q: string;
  relevantIds: string[];
  bucket: QueryBucket;
  filters?: SearchFilters;
  notes?: string;
  split?: 'train' | 'val' | 'test';
  needTag?: string;
};

type DatasetFile = {
  meta?: {
    description?: string;
    buckets?: Record<string, string>;
    targets?: {
      precision5LiftOverBm25?: number;
      p95LatencyMs?: number;
      noisyDropTolerance?: number;
    };
    kValues?: number[];
  };
  queries: Phase2Query[];
};

type RunRecord = {
  queryId: string;
  bucket: QueryBucket;
  needTag?: string;
  mode: Mode;
  runIndex: number;
  latencyMs: number;
  k: number;
  retrievedIds: string[];
  relevantIds: string[];
  precision: number;
  recall: number;
  mrr: number;
  error?: string;
};

type Aggregate = {
  metric: 'precision' | 'recall' | 'mrr';
  mode: Mode;
  k: number;
  bucket?: QueryBucket | 'all';
  mean: number;
  coverage: number;
  ci?: { lower: number; upper: number };
};

type LatencyAggregate = {
  mode: Mode;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  average: number;
};

type Config = {
  baseUrl: string;
  apiKey?: string;
  kValues: number[];
  modes: Mode[];
  runs: number;
  level: Level;
  batchSize: number;
  seed: number;
  datasetPath: string;
  outputDir: string;
  warmups: number;
  timeoutMs: number;
};

type AcceptanceTargets = {
  precision5LiftOverBm25: number;
  p95LatencyMs: number;
  noisyDropTolerance: number;
};

const DEFAULT_ACCEPTANCE: AcceptanceTargets = {
  precision5LiftOverBm25: 0.1,
  p95LatencyMs: 800,
  noisyDropTolerance: 0.05
};

const DEFAULT_CONFIG: Config = {
  baseUrl: process.env.PHASE2_BASE_URL ?? 'http://localhost:3000',
  apiKey: process.env.PHASE2_API_KEY ?? process.env.API_KEY,
  kValues: [5, 10],
  modes: ['hybrid', 'lexical', 'semantic'],
  runs: 3,
  level: 'paper',
  batchSize: 5,
  seed: 42,
  datasetPath: path.resolve('tests/ir-metrics/queries.json'),
  outputDir: path.resolve('tests/ir-metrics/results'),
  warmups: 1,
  timeoutMs: Number(process.env.PHASE2_TIMEOUT_MS ?? 20_000)
};

function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const cfg: Partial<Config> = {};

  const takeValue = (flag: string) => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) {
      return args[idx + 1];
    }
    return undefined;
  };

  const baseUrl = takeValue('--baseUrl');
  if (baseUrl) cfg.baseUrl = baseUrl;
  const apiKey = takeValue('--apiKey');
  if (apiKey) cfg.apiKey = apiKey;
  const modes = takeValue('--modes');
  if (modes) cfg.modes = modes.split(',').map((m) => m.trim() as Mode);
  const kValues = takeValue('--k');
  if (kValues) cfg.kValues = kValues.split(',').map((k) => Number(k));
  const runs = takeValue('--runs');
  if (runs) cfg.runs = Number(runs);
  const level = takeValue('--level');
  if (level === 'paper' || level === 'chunk') cfg.level = level;
  const batchSize = takeValue('--batchSize');
  if (batchSize) cfg.batchSize = Number(batchSize);
  const seed = takeValue('--seed');
  if (seed) cfg.seed = Number(seed);
  const datasetPath = takeValue('--dataset');
  if (datasetPath) cfg.datasetPath = path.resolve(datasetPath);
  const outputDir = takeValue('--out');
  if (outputDir) cfg.outputDir = path.resolve(outputDir);
  const warmups = takeValue('--warmups');
  if (warmups) cfg.warmups = Number(warmups);
  const timeoutMs = takeValue('--timeout');
  if (timeoutMs) cfg.timeoutMs = Number(timeoutMs);

  return cfg;
}

function loadDataset(datasetPath: string): DatasetFile {
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset file missing: ${datasetPath}`);
  }
  const raw = fs.readFileSync(datasetPath, 'utf8');
  const parsed = JSON.parse(raw) as DatasetFile;
  if (!Array.isArray(parsed.queries) || parsed.queries.length === 0) {
    throw new Error('Dataset must include at least one query');
  }
  return parsed;
}

function mulberry32(seed: number): () => number {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function bootstrapCI(values: number[], alpha = 0.05, iterations = 400): { lower: number; upper: number } | undefined {
  if (values.length === 0) return undefined;
  const samples: number[] = [];
  const rand = mulberry32(1234);
  for (let i = 0; i < iterations; i += 1) {
    const resample: number[] = [];
    for (let j = 0; j < values.length; j += 1) {
      const pick = Math.floor(rand() * values.length);
      resample.push(values[pick]);
    }
    const mean =
      resample.reduce((sum, v) => sum + v, 0) / (resample.length === 0 ? 1 : resample.length);
    samples.push(mean);
  }
  const lowerIdx = Math.floor((alpha / 2) * samples.length);
  const upperIdx = Math.ceil((1 - alpha / 2) * samples.length) - 1;
  const sorted = samples.sort((a, b) => a - b);
  return { lower: sorted[lowerIdx], upper: sorted[upperIdx] };
}

function computeMetrics(retrieved: string[], relevant: Set<string>, k: number) {
  const atK = retrieved.slice(0, k);
  let hits = 0;
  let mrr = 0;
  for (let i = 0; i < atK.length; i += 1) {
    if (relevant.has(atK[i])) {
      hits += 1;
      if (mrr === 0) mrr = 1 / (i + 1);
    }
  }
  const precision = hits / k;
  const recall = relevant.size ? hits / relevant.size : 0;
  return { precision, recall, mrr, hits };
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pearson(x: number[], y: number[]) {
  if (x.length === 0 || y.length === 0 || x.length !== y.length) return 0;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < x.length; i += 1) {
    const cx = x[i] - mx;
    const cy = y[i] - my;
    num += cx * cy;
    dx += cx * cx;
    dy += cy * cy;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

function erf(x: number) {
  // Abramowitz and Stegun approximation
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * Math.abs(x));
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return sign * y;
}

function normalCdf(z: number) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function wilcoxonSignedRank(diffs: number[]) {
  const nonZero = diffs.filter((d) => d !== 0);
  if (nonZero.length === 0) {
    return { pValue: 1, z: 0, n: 0 };
  }

  const ranks = nonZero
    .map((d, idx) => ({ d, idx, abs: Math.abs(d) }))
    .sort((a, b) => a.abs - b.abs)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  let Wpos = 0;
  let Wneg = 0;
  for (const r of ranks) {
    if (r.d > 0) Wpos += r.rank;
    else Wneg += r.rank;
  }
  const W = Math.min(Wpos, Wneg);
  const n = ranks.length;
  const meanW = (n * (n + 1)) / 4;
  const varW = (n * (n + 1) * (2 * n + 1)) / 24;
  const z = (W - meanW) / Math.sqrt(varW);
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { pValue, z, n };
}

function friedman(valuesByMode: Record<string, number[]>) {
  const modes = Object.keys(valuesByMode);
  if (modes.length < 3) return undefined;
  const lengths = modes.map((m) => valuesByMode[m].length);
  if (new Set(lengths).size !== 1) return undefined;
  const n = lengths[0];
  if (n === 0) return undefined;

  const ranksPerQuery: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const row = modes.map((m) => ({ mode: m, value: valuesByMode[m][i] }));
    row.sort((a, b) => b.value - a.value);
    const ranks = row.map((_, idx) => idx + 1);
    const rankedRow: number[] = [];
    row.forEach((entry, idx) => {
      rankedRow[modes.indexOf(entry.mode)] = ranks[idx];
    });
    ranksPerQuery.push(rankedRow);
  }

  const sumRanks = modes.map((_, modeIdx) =>
    ranksPerQuery.reduce((sum, row) => sum + row[modeIdx], 0)
  );
  const k = modes.length;
  const chiSq =
    (12 / (n * k * (k + 1))) * sumRanks.reduce((sum, r) => sum + r * r, 0) -
    3 * n * (k + 1);
  // p-value via chi-square approx with k-1 df (upper tail)
  const df = k - 1;
  const pValue = 1 - chiSquareCdf(chiSq, df);
  return { chiSq, df, pValue };
}

function gammaIncomplete(a: number, x: number) {
  // Lower incomplete gamma via series approximation.
  let sum = 1 / a;
  let term = 1 / a;
  for (let n = 1; n < 100; n += 1) {
    term *= x / (a + n);
    sum += term;
    if (term < 1e-8) break;
  }
  return Math.pow(x, a) * Math.exp(-x) * sum;
}

function gammaFunction(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFunction(1 - z));
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i += 1) {
    x += p[i] / (z + i);
  }
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function chiSquareCdf(x: number, k: number) {
  if (x < 0) return 0;
  return gammaIncomplete(k / 2, x / 2) / gammaFunction(k / 2);
}

async function fetchJson<T>(url: string, body: unknown, cfg: Config): Promise<{ data?: T; error?: string; latency: number }> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { 'x-api-key': cfg.apiKey } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const latency = performance.now() - started;
    if (!res.ok) {
      const text = await res.text();
      return { error: `${res.status} ${text}`.slice(0, 500), latency };
    }
    const data = (await res.json()) as T;
    return { data, latency };
  } catch (err) {
    const latency = performance.now() - started;
    return { error: (err as Error).message, latency };
  } finally {
    clearTimeout(timeout);
  }
}

async function runPhase(cfg: Config, dataset: DatasetFile) {
  const kValues = cfg.kValues.length ? cfg.kValues : dataset.meta?.kValues ?? DEFAULT_CONFIG.kValues;
  const maxK = Math.max(...kValues);

  const baseQueries = dataset.queries;
  const start = performance.now();
  const records: RunRecord[] = [];

  // Warmups to prime caches and embeddings.
  if (cfg.warmups > 0) {
    const warmQuery = baseQueries[0];
    for (let i = 0; i < cfg.warmups; i += 1) {
      await fetchJson(
        `${cfg.baseUrl}/search`,
        { q: warmQuery.q, limit: maxK, mode: 'hybrid', level: cfg.level },
        cfg
      );
    }
  }

  for (const k of kValues) {
    for (let runIndex = 0; runIndex < cfg.runs; runIndex += 1) {
      const shuffled = shuffle(baseQueries, cfg.seed + runIndex + k);
      const batches = chunkArray(shuffled, cfg.batchSize);
      for (const batch of batches) {
        const promises = batch.map(async (query) => {
          const relevant = new Set(query.relevantIds);
          const cache: Partial<
            Record<Mode, { ids: string[]; latency: number; error?: string }>
          > = {};
          for (const mode of cfg.modes) {
            if (!cache[mode]) {
              const res = await fetchJson<{ results: Array<{ id: string }> }>(
                `${cfg.baseUrl}/search`,
                {
                  q: query.q,
                  limit: maxK,
                  mode,
                  level: cfg.level,
                  filters: query.filters
                },
                cfg
              );
              cache[mode] = {
                ids: res.data?.results?.map((r) => r.id) ?? [],
                latency: res.latency,
                error: res.error
              };
            }
            const payload = cache[mode]!;
            const { precision, recall, mrr } = computeMetrics(payload.ids, relevant, k);
            records.push({
              queryId: query.id,
              bucket: query.bucket,
              needTag: query.needTag,
              mode,
              runIndex,
              latencyMs: payload.latency,
              k,
              retrievedIds: payload.ids.slice(0, k),
              relevantIds: query.relevantIds,
              precision,
              recall,
              mrr,
              error: payload.error
            });
          }
        });
        await Promise.all(promises);
      }
    }
  }

  const durationMs = performance.now() - start;
  return { records, durationMs };
}

function aggregateMetrics(records: RunRecord[]): { aggregates: Aggregate[]; latency: LatencyAggregate[]; errorRate: number } {
  const aggregates: Aggregate[] = [];
  const latency: LatencyAggregate[] = [];
  const errorRate = records.filter((r) => r.error).length / (records.length || 1);

  const groupedModes = new Set(records.map((r) => r.mode));
  const groupedKs = new Set(records.map((r) => r.k));

  for (const mode of groupedModes) {
    const latencies = records.filter((r) => r.mode === mode).map((r) => r.latencyMs);
    latency.push({
      mode,
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      average: mean(latencies)
    });
  }

  for (const mode of groupedModes) {
    for (const k of groupedKs) {
      const subset = records.filter((r) => r.mode === mode && r.k === k);
      for (const metric of ['precision', 'recall', 'mrr'] as const) {
        const values = subset.map((s) => s[metric]);
        aggregates.push({
          metric,
          mode,
          k,
          bucket: 'all',
          mean: mean(values),
          coverage: subset.filter((s) => s[metric] > 0).length / (subset.length || 1),
          ci: bootstrapCI(values)
        });
        const buckets = new Set(subset.map((s) => s.bucket));
        for (const bucket of buckets) {
          const bVals = subset.filter((s) => s.bucket === bucket).map((s) => s[metric]);
          aggregates.push({
            metric,
            mode,
            k,
            bucket,
            mean: mean(bVals),
            coverage: bVals.filter((v) => v > 0).length / (bVals.length || 1),
            ci: bootstrapCI(bVals)
          });
        }
      }
    }
  }

  return { aggregates, latency, errorRate };
}

function compareAgainstBm25(records: RunRecord[], k: number) {
  const baseline = records.filter((r) => r.mode === 'lexical' && r.k === k);
  const challengers = ['semantic', 'hybrid'] as const;
  const comparisons: Record<string, { lift: number; wilcoxonP: number }> = {};

  for (const mode of challengers) {
    const challenger = records.filter((r) => r.mode === mode && r.k === k);
    const paired: number[] = [];
    const pairedChallenger: number[] = [];
    const byKey = new Map<string, RunRecord>();
    baseline.forEach((b) => byKey.set(`${b.queryId}-${b.runIndex}`, b));
    for (const c of challenger) {
      const key = `${c.queryId}-${c.runIndex}`;
      const b = byKey.get(key);
      if (!b) continue;
      paired.push(b.precision);
      pairedChallenger.push(c.precision);
    }
    const diffs = pairedChallenger.map((v, idx) => v - paired[idx]);
    const lift = mean(diffs);
    const { pValue } = wilcoxonSignedRank(diffs);
    comparisons[mode] = { lift, wilcoxonP: pValue };
  }
  return comparisons;
}

function correlateLatency(records: RunRecord[], k: number) {
  const correlations: Record<Mode, number> = { hybrid: 0, lexical: 0, semantic: 0 };
  for (const mode of ['hybrid', 'lexical', 'semantic'] as const) {
    const subset = records.filter((r) => r.mode === mode && r.k === k && !r.error);
    const lat = subset.map((s) => s.latencyMs);
    const mrr = subset.map((s) => s.mrr);
    correlations[mode] = pearson(lat, mrr);
  }
  return correlations;
}

function acceptanceGates(records: RunRecord[], targets: AcceptanceTargets, kValues: number[], latencyAgg: LatencyAggregate[]) {
  const comparisons = compareAgainstBm25(records, 5);
  const precisionLift = comparisons.hybrid?.lift ?? 0;
  const hybridLatencyP95 = latencyAgg.find((l) => l.mode === 'hybrid')?.p95 ?? 0;

  const noisy = records.filter((r) => r.bucket === 'noisy');
  const clean = records.filter((r) => r.bucket !== 'noisy');
  const maxK = Math.max(...kValues);
  const noisyMrr =
    mean(noisy.filter((r) => r.k === maxK && r.mode === 'hybrid').map((r) => r.mrr)) || 0;
  const cleanMrr =
    mean(clean.filter((r) => r.k === maxK && r.mode === 'hybrid').map((r) => r.mrr)) || 0;
  const noisyDrop = cleanMrr ? (cleanMrr - noisyMrr) / cleanMrr : 0;

  return {
    precisionLiftOk: precisionLift >= targets.precision5LiftOverBm25,
    latencyOk: hybridLatencyP95 <= targets.p95LatencyMs,
    noisyOk: noisyDrop <= targets.noisyDropTolerance,
    details: {
      precisionLift,
      hybridLatencyP95,
      noisyDrop
    }
  };
}

function summarize(records: RunRecord[], cfg: Config, dataset: DatasetFile, durationMs: number) {
  const { aggregates, latency, errorRate } = aggregateMetrics(records);
  const kValues = cfg.kValues.length ? cfg.kValues : dataset.meta?.kValues ?? DEFAULT_CONFIG.kValues;
  const latencyCorrelation = correlateLatency(records, Math.max(...kValues));

  const byMode: Record<Mode, number[]> = { hybrid: [], lexical: [], semantic: [] };
  for (const mode of cfg.modes) {
    const vals = records.filter((r) => r.mode === mode && r.k === Math.max(...kValues)).map((r) => r.mrr);
    byMode[mode] = vals;
  }
  const friedmanResult = friedman(byMode);

  const targets: AcceptanceTargets = {
    precision5LiftOverBm25:
      dataset.meta?.targets?.precision5LiftOverBm25 ?? DEFAULT_ACCEPTANCE.precision5LiftOverBm25,
    p95LatencyMs: dataset.meta?.targets?.p95LatencyMs ?? DEFAULT_ACCEPTANCE.p95LatencyMs,
    noisyDropTolerance:
      dataset.meta?.targets?.noisyDropTolerance ?? DEFAULT_ACCEPTANCE.noisyDropTolerance
  };
  const gates = acceptanceGates(records, targets, kValues, latency);

  return {
    aggregates,
    latency,
    latencyCorrelation,
    friedmanResult,
    gates,
    errorRate,
    throughputQps: records.length / (durationMs / 1000),
    records
  };
}

async function checkSecurity(cfg: Config) {
  const missingKeyProbe = await fetchJson(
    `${cfg.baseUrl}/search`,
    { q: 'security probe', limit: 1, mode: 'hybrid', level: cfg.level },
    { ...cfg, apiKey: undefined }
  );
  const burstStart = performance.now();
  const burstRequests = 6;
  const burst = await Promise.all(
    Array.from({ length: burstRequests }).map(() =>
      fetchJson(
        `${cfg.baseUrl}/search`,
        { q: 'rate limit probe', limit: 1, mode: 'lexical', level: cfg.level },
        cfg
      )
    )
  );
  const burstLatency = performance.now() - burstStart;
  const rateLimited = burst.some((r) => (r.error ?? '').includes('429'));
  return {
    unauthorizedStatus: missingKeyProbe.error ?? 'allowed',
    rateLimited,
    burstLatencyMs: burstLatency / burstRequests
  };
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  const userCfg = parseArgs();
  const cfg: Config = { ...DEFAULT_CONFIG, ...userCfg };
  const dataset = loadDataset(cfg.datasetPath);
  if (dataset.meta?.kValues && !userCfg.kValues) {
    cfg.kValues = dataset.meta.kValues;
  }

  ensureDir(cfg.outputDir);

  const { records, durationMs } = await runPhase(cfg, dataset);
  const summary = summarize(records, cfg, dataset, durationMs);
  const security = await checkSecurity(cfg);
  const resource = {
    memory: process.memoryUsage(),
    cpu: process.resourceUsage()
  };

  const output = {
    timestamp: new Date().toISOString(),
    config: cfg,
    datasetMeta: dataset.meta,
    durationMs,
    summary,
    security,
    resource
  };

  const outfile = path.join(cfg.outputDir, `phase2-${Date.now()}.json`);
  fs.writeFileSync(outfile, JSON.stringify(output, null, 2));

  // eslint-disable-next-line no-console
  console.log(
    [
      `Phase II test complete -> ${outfile}`,
      `Requests: ${records.length} | duration ${(durationMs / 1000).toFixed(1)}s | QPS ${summary.throughputQps.toFixed(2)}`,
      `Error rate: ${(summary.errorRate * 100).toFixed(2)}% | Hybrid p95 latency: ${
        summary.latency.find((l) => l.mode === 'hybrid')?.p95.toFixed(1) ?? 'n/a'
      }ms`,
      `Acceptance: precision lift ${summary.gates.details.precisionLift.toFixed(3)} (target ${(
        dataset.meta?.targets?.precision5LiftOverBm25 ?? DEFAULT_ACCEPTANCE.precision5LiftOverBm25
      ).toFixed(2)}), p95 ${(summary.gates.details.hybridLatencyP95 ?? 0).toFixed(1)}ms (target ${
        dataset.meta?.targets?.p95LatencyMs ?? DEFAULT_ACCEPTANCE.p95LatencyMs
      }ms), noisy drop ${(summary.gates.details.noisyDrop * 100).toFixed(2)}%`
    ].join('\n')
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Phase II test failed', err);
  process.exit(1);
});
