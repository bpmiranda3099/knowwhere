import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from '../helpers/buildTestServer';

describe('routes: embed', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('POST /embed validates input', async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: 'POST', url: '/embed', payload: { texts: [] } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /embed works (mocked embedding client)', async () => {
    vi.doMock('../../../src/services/embeddingClient', () => ({
      embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    }));

    const app = await buildTestServer();
    const res = await app.inject({ method: 'POST', url: '/embed', payload: { texts: ['hello'] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().embeddings[0]).toEqual([0.1, 0.2, 0.3]);
  });
});

