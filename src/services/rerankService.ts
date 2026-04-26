import { config } from '../config/env';
import { HTTP_TIMEOUT_MS } from '../config/system/constants';

interface RerankResponse {
  scores: number[];
}

export async function rerank(
  query: string,
  candidates: string[]
): Promise<number[] | null> {
  // Allow bypass in automated tests where the reranker service isn't started.
  const rerankDisabled = new Set(['1', 'true']).has(process.env.SKIP_RERANK ?? '');
  if (config.NODE_ENV === 'test' && rerankDisabled) {
    return null;
  }
  if (!config.RERANK_ENDPOINT) {
    throw new Error('RERANK_ENDPOINT is required');
  }
  if (candidates.length === 0) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(config.RERANK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documents: candidates }),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`rerank failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as RerankResponse;
    if (Array.isArray(data.scores)) {
      clearTimeout(timeout);
      return data.scores;
    }
    clearTimeout(timeout);
    return null;
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`rerank error: ${(err as Error).message}`);
  }
}
