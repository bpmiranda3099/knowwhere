import { INGEST_DEFAULTS } from '../../src/config/ingest/constants';

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  attempts = INGEST_DEFAULTS.retryAttempts,
  baseDelayMs = INGEST_DEFAULTS.retryBaseDelayMs
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      const isLast = i === attempts - 1;
      if (isLast) break;
      const delay = baseDelayMs * 2 ** i;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed');
}
