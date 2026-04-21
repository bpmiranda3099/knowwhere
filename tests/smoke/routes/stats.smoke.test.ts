import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from '../helpers/buildTestServer';

describe('routes: stats', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('GET /stats works (mocked DB)', async () => {
    vi.doMock('../../../src/db/db', () => ({
      query: vi.fn().mockResolvedValue({
        rows: [{ papers: 1, chunks: 2, subjects: 3, sources: 4 }]
      })
    }));

    const app = await buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ papers: 1, chunks: 2, subjects: 3, sources: 4 });
  });
});

