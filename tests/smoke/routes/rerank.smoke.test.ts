import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from '../helpers/buildTestServer';

describe('routes: rerank', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('POST /rerank validates input', async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: 'POST', url: '/rerank', payload: { query: '', documents: [] } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /rerank works (mocked rerank service)', async () => {
    vi.doMock('../../../src/services/rerankService', () => ({
      rerank: vi.fn().mockResolvedValue([0.9, 0.1])
    }));

    const app = await buildTestServer();
    const res = await app.inject({
      method: 'POST',
      url: '/rerank',
      payload: { query: 'q', documents: ['a', 'b'] }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ scores: [0.9, 0.1] });
  });
});

