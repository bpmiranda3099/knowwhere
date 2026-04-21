import { describe, expect, it } from 'vitest';
import { http, httpJson } from '../helpers/http';

describe('e2e: evaluate', () => {
  it('POST /evaluate validates input (400)', async () => {
    const res = await http('/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: [] })
    });
    expect(res.status).toBe(400);
  });

  it('POST /evaluate returns 202 + runId', async () => {
    const { res, json } = await httpJson<{ runId: number }>('/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        k: 2,
        modes: ['hybrid'],
        level: 'paper',
        queries: [{ q: 'test query', relevantIds: ['nonexistent-id-ok'] }]
      })
    });
    expect(res.status).toBe(202);
    expect(typeof json.runId).toBe('number');
  });
});

