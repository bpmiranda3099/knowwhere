import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from '../helpers/buildTestServer';

describe('routes: health', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('GET /health works', async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/health?services=api' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /ready works', async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
  });
});

