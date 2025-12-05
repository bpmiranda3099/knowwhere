import { config } from '../config/env';
import { HTTP_TIMEOUT_MS } from '../config/system/constants';

interface RerankResponse {
  scores: number[];
}

export async function rerank(
  query: string,
  candidates: string[]
): Promise<number[] | null> {
  const rerankDisabled = process.env.SKIP_RERANK === '1' || process.env.SKIP_RERANK === 'true';
  if (!config.RERANK_ENDPOINT || rerankDisabled || candidates.length === 0) {
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
      // eslint-disable-next-line no-console
      console.warn(`rerank failed (${res.status}): ${text.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as RerankResponse;
    if (Array.isArray(data.scores)) {
      return data.scores;
    }
    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('rerank error', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
