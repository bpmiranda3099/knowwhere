import { config } from '../config/env';
import { HTTP_TIMEOUT_MS } from '../config/system/constants';

interface RerankResponse {
  scores: number[];
}

export async function rerank(
  query: string,
  candidates: string[]
): Promise<number[] | null> {
  if (!config.RERANK_ENDPOINT || candidates.length === 0) {
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
      throw new Error(`rerank failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as RerankResponse;
    if (Array.isArray(data.scores)) {
      return data.scores;
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
