import { config } from '../config/env';
import { HTTP_TIMEOUT_MS } from '../config/system/constants';

type EmbeddingResponse =
  | { embeddings: number[][] }
  | { data: Array<{ embedding: number[] }> }
  | { vector: number[] };

async function fetchJson<T>(url: string, options: RequestInit, caller: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${caller} failed (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function embedText(text: string): Promise<number[]> {
  const payload = { model: config.EMBEDDING_MODEL, inputs: [text] };
  const data = await fetchJson<EmbeddingResponse>(
    config.EMBEDDING_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    },
    'embedText'
  );

  if ('embeddings' in data && Array.isArray(data.embeddings)) {
    return data.embeddings[0];
  }
  if ('data' in data && Array.isArray(data.data) && data.data[0]?.embedding) {
    return data.data[0].embedding;
  }
  if ('vector' in data) {
    return data.vector;
  }
  throw new Error('Unsupported embedding response shape');
}
