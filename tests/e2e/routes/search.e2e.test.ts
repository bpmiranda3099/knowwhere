import { describe, expect, it } from 'vitest';
import { http, httpJson } from '../helpers/http';

describe('e2e: search', () => {
  it('POST /search validates input (400)', async () => {
    const res = await http('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: '' })
    });
    expect(res.status).toBe(400);
  });

  it('POST /search returns 200 and results array', async () => {
    const { res, json } = await httpJson<{ results: unknown[]; mode: string; level: string }>('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'graph neural networks', limit: 5, mode: 'hybrid', level: 'paper' })
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(json.results)).toBe(true);
    expect(['hybrid', 'lexical', 'semantic']).toContain(json.mode);
    expect(['paper', 'chunk']).toContain(json.level);
  });
});

