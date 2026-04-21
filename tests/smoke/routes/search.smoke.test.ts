import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from '../helpers/buildTestServer';

describe('routes: search', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('POST /search validates input', async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: 'POST', url: '/search', payload: { q: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /search returns mocked data', async () => {
    vi.doMock('../../../src/services/searchService', () => ({
      search: vi.fn().mockResolvedValue([
        { id: '1', title: 't', abstract: 'a', doi: null, url: null, subjects: null, source: null, snippet: 's', hybridScore: 1 }
      ])
    }));

    const app = await buildTestServer();
    const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'hello' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].id).toBe('1');
  });
});

