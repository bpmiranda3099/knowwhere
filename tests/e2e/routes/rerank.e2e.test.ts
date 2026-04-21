import { describe, expect, it } from 'vitest';
import { http, httpJson } from '../helpers/http';

describe('e2e: rerank', () => {
  it('POST /rerank validates input (400)', async () => {
    const res = await http('/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '', documents: [] })
    });
    expect(res.status).toBe(400);
  });

  it('POST /rerank returns scores', async () => {
    const { res, json } = await httpJson<{ scores: number[] }>('/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'machine learning', documents: ['doc a', 'doc b'] })
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(json.scores)).toBe(true);
    expect(json.scores).toHaveLength(2);
  });
});

