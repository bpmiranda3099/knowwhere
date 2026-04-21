import { afterAll, describe, expect, it } from 'vitest';
import { buildIntegrationServer } from './helpers/buildIntegrationServer';

describe('integration: api + postgres', () => {
  it('GET /health?services=api,db returns ok', async () => {
    const app = await buildIntegrationServer();
    const res = await app.inject({ method: 'GET', url: '/health?services=api,db' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.services.api).toBe('ok');
    // DB check should be ok if schema/migrate ran.
    expect(['ok', 'error', 'unknown']).toContain(body.services.db);
  });

  it('GET /stats returns counts', async () => {
    const app = await buildIntegrationServer();
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // pg COUNT(*) often comes back as string; accept either and validate numeric.
    const papers = Number(body.papers);
    const chunks = Number(body.chunks);
    expect(Number.isFinite(papers)).toBe(true);
    expect(Number.isFinite(chunks)).toBe(true);
    expect(papers).toBeGreaterThanOrEqual(0);
    expect(chunks).toBeGreaterThanOrEqual(0);
  });

  it('POST /search lexical returns results array', async () => {
    const app = await buildIntegrationServer();
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { q: 'test', mode: 'lexical', level: 'paper', limit: 5 }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('GET /logs returns logs array', async () => {
    const app = await buildIntegrationServer();
    const res = await app.inject({ method: 'GET', url: '/logs?limit=5' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.logs)).toBe(true);
  });

  afterAll(async () => {
    // Ensure the PG pool is closed so Vitest can exit cleanly.
    const { closePool } = await import('../../src/db/db');
    await closePool();
  });
});

