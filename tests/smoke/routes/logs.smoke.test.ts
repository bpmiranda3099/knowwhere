import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from '../helpers/buildTestServer';

describe('routes: logs', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('GET /logs validates input', async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/logs?limit=0' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /logs works (mocked DB)', async () => {
    vi.doMock('../../../src/db/db', () => ({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 1, query: 'q', result_count: 1, duration_ms: 10, created_at: new Date().toISOString() }]
      })
    }));

    const app = await buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/logs?limit=1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().logs).toHaveLength(1);
  });
});

