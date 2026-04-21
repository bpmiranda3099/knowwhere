import { describe, expect, it } from 'vitest';
import { http, httpJson } from '../helpers/http';

describe('e2e: embed', () => {
  it('POST /embed validates input (400)', async () => {
    const res = await http('/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [] })
    });
    expect(res.status).toBe(400);
  });

  it('POST /embed returns embeddings', async () => {
    const { res, json } = await httpJson<{ embeddings: number[][] }>('/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: ['hello world'] })
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(json.embeddings)).toBe(true);
    expect(Array.isArray(json.embeddings[0])).toBe(true);
    expect(json.embeddings[0].length).toBeGreaterThan(0);
  });
});

