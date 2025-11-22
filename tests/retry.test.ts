import { describe, expect, it } from 'vitest';
import { fetchWithRetry } from '../scripts/utils/retry';

describe('fetchWithRetry', () => {
  it('retries on failure', async () => {
    let calls = 0;
    // Mock fetch
    // @ts-expect-error
    global.fetch = async () => {
      calls += 1;
      if (calls < 2) {
        return { ok: false, status: 500 };
      }
      return { ok: true, status: 200, text: async () => 'ok', json: async () => ({ ok: true }) };
    };

    const res = await fetchWithRetry('http://example.com', {}, 3, 1);
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });
});
