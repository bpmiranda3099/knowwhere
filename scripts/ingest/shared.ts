export type IngestSource = 'arxiv' | 'crossref' | 'openalex';

export interface IngestRunOptions {
  query: string;
  quantity: number;
  pacingMs: number;
}

export interface IngestRunRequest extends IngestRunOptions {
  source: IngestSource;
}

export interface IngestRunResult {
  fetched: number;
  processed: number;
  source: IngestSource;
}

export type IngestRunner = (options: IngestRunOptions) => Promise<IngestRunResult>;

export type IngestRunnerMap = Record<IngestSource, IngestRunner>;

const SOURCE_LABELS: Record<IngestSource, string> = {
  arxiv: 'arXiv',
  crossref: 'Crossref',
  openalex: 'OpenAlex'
};

function formatPacing(pacingMs: number): string {
  if (pacingMs <= 0) {
    return 'no extra pacing';
  }

  return `1 request every ${(pacingMs / 1000).toFixed(1)}s`;
}

export function getSourceLabel(source: IngestSource): string {
  return SOURCE_LABELS[source];
}

export function buildIngestSummary(request: IngestRunRequest): string {
  return [
    `Source: ${getSourceLabel(request.source)}`,
    `Query: ${request.query}`,
    `Quantity: ${request.quantity}`,
    `Pacing: ${formatPacing(request.pacingMs)}`
  ].join('\n');
}

export async function runSelectedIngest(
  request: IngestRunRequest,
  runners: IngestRunnerMap
): Promise<IngestRunResult> {
  return runners[request.source]({
    query: request.query,
    quantity: request.quantity,
    pacingMs: request.pacingMs
  });
}
