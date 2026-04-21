import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from '../helpers/buildTestServer';

describe('routes: evaluate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('POST /evaluate validates input', async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: 'POST', url: '/evaluate', payload: { queries: [] } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /evaluate works (mocked DB + search)', async () => {
    vi.doMock('../../../src/services/searchService', () => ({
      search: vi.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }])
    }));
    vi.doMock('../../../src/db/db', () => {
      const query = vi.fn(async (text: string) => {
        if (text.includes('INSERT INTO evaluation_runs')) {
          return { rows: [{ id: 42 }] };
        }
        return { rows: [] };
      });
      return { query };
    });

    const app = await buildTestServer();
    const res = await app.inject({
      method: 'POST',
      url: '/evaluate',
      payload: {
        k: 2,
        modes: ['hybrid'],
        level: 'paper',
        queries: [{ q: 'hello', relevantIds: ['p1'] }]
      }
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().runId).toBe(42);
  });
});

