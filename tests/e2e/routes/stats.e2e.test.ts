import { describe, expect, it } from 'vitest';
import { httpJson } from '../helpers/http';

describe('e2e: stats', () => {
  it('GET /stats returns counts', async () => {
    const { res, json } = await httpJson<{ papers: number; chunks: number; subjects: number; sources: number }>(
      '/stats'
    );
    expect(res.status).toBe(200);
    expect(typeof json.papers).toBe('number');
    expect(typeof json.chunks).toBe('number');
    expect(typeof json.subjects).toBe('number');
    expect(typeof json.sources).toBe('number');
  });
});

