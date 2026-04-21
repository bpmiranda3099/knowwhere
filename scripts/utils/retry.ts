import { INGEST_DEFAULTS } from '../../src/config/ingest/constants';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const suffix = body ? `: ${body.slice(0, 500)}` : '';
        // Special-case 429 to avoid hammering the upstream.
        if (res.status === 429 && i < attempts - 1) {
          const retryAfterHeader = res.headers.get('retry-after');
          const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
          const fallbackMs = Math.max(10_000, baseDelayMs * 2 ** i);
          const delayMs = Number.isFinite(retryAfterSec) ? Math.max(fallbackMs, retryAfterSec * 1000) : fallbackMs;
          await sleep(delayMs);
          continue;
        }
        throw new Error(`HTTP ${res.status}${suffix}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      const isLast = i === attempts - 1;
      if (isLast) break;
      const delay = baseDelayMs * 2 ** i;
      await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed');
}
