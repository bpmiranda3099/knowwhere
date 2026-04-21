import { describe, expect, it } from 'vitest';
import { http, httpJson } from '../helpers/http';

describe('e2e: logs', () => {
  it('GET /logs validates limit (400)', async () => {
    const res = await http('/logs?limit=0');
    expect(res.status).toBe(400);
  });

  it('GET /logs returns logs array', async () => {
    const { res, json } = await httpJson<{ logs: unknown[] }>('/logs?limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(json.logs)).toBe(true);
  });
});

