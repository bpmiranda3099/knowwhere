import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildServer } from '../src/api/index';
import * as searchService from '../src/services/searchService';

describe('server routes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('health works', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('search validates input', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'POST', url: '/search', payload: { q: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('search returns mocked data', async () => {
    const app = await buildServer();
    vi.spyOn(searchService, 'search').mockResolvedValue([
      { id: '1', title: 't', abstract: 'a', doi: null, url: null, subjects: null, source: null, snippet: 's', hybridScore: 1 }
    ]);
    const res = await app.inject({ method: 'POST', url: '/search', payload: { q: 'hello' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results[0].id).toBe('1');
  });
});
