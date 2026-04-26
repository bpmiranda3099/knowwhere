import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeApp() {
  return {
    get: vi.fn()
  } as any;
}

describe('health routes (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registers /health and /ready', async () => {
    const app = fakeApp();
    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    expect(app.get).toHaveBeenCalledWith('/health', expect.any(Function));
    expect(app.get).toHaveBeenCalledWith('/ready', expect.any(Function));
  });

  it('health checks only requested services', async () => {
    const app = fakeApp();

    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    vi.doMock('../../../../src/db/db', () => ({ query: queryMock }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({ ok: true }));
    vi.doMock('../../../../src/config/env', () => ({
      config: { EMBEDDING_ENDPOINT: 'http://embed/embed', RERANK_ENDPOINT: 'http://rerank/rerank' }
    }));

    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const healthHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/health')?.[1];
    const res = await healthHandler({ query: { services: 'api' } });

    expect(res.status).toBe('ok');
    expect(res.services.api).toBe('ok');
    expect(res.services.db).toBe('unknown');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('health marks db error when query fails', async () => {
    const app = fakeApp();

    const queryMock = vi.fn().mockRejectedValue(new Error('db down'));
    vi.doMock('../../../../src/db/db', () => ({ query: queryMock }));
    vi.doMock('../../../../src/config/env', () => ({ config: {} }));

    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const healthHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/health')?.[1];
    const res = await healthHandler({ query: { services: 'db' } });

    expect(res.services.db).toBe('error');
  });

  it('health checks embedding/reranker and marks error on non-ok and exceptions', async () => {
    const app = fakeApp();

    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    vi.doMock('../../../../src/db/db', () => ({ query: queryMock }));

    // @ts-expect-error test override
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false }) // embedding -> error
      .mockRejectedValueOnce(new Error('down')); // reranker -> error

    vi.doMock('../../../../src/config/env', () => ({
      config: { EMBEDDING_ENDPOINT: 'http://embed/embed', RERANK_ENDPOINT: 'http://rerank/rerank' }
    }));

    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const healthHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/health')?.[1];
    const res = await healthHandler({ query: { services: 'embedding,reranker,web' } });

    expect(res.services.embedding).toBe('error');
    expect(res.services.reranker).toBe('error');
    expect(res.services.web).toBe('unknown');
  });

  it('ready returns ready', async () => {
    const app = fakeApp();
    vi.doMock('../../../../src/config/env', () => ({ config: {} }));
    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const readyHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/ready')?.[1];
    await expect(readyHandler()).resolves.toEqual({ status: 'ready' });
  });

  it('health default checks db + http services and reports ok/unknown', async () => {
    const app = fakeApp();

    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    vi.doMock('../../../../src/db/db', () => ({ query: queryMock }));

    // embedding ok, reranker ok
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({ ok: true }));

    // rerank endpoint unset so reranker stays unknown when requested via default list
    vi.doMock('../../../../src/config/env', () => ({
      config: { EMBEDDING_ENDPOINT: 'http://embed/embed', RERANK_ENDPOINT: undefined }
    }));

    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const healthHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/health')?.[1];
    const res = await healthHandler({ query: {} });

    expect(res.services.api).toBe('ok');
    expect(res.services.db).toBe('ok');
    expect(res.services.embedding).toBe('ok');
    expect(res.services.reranker).toBe('unknown');
    expect(res.services.web).toBe('unknown');
  });

  it('embedding check is unknown when endpoint is missing', async () => {
    const app = fakeApp();
    vi.doMock('../../../../src/db/db', () => ({ query: vi.fn() }));
    vi.doMock('../../../../src/config/env', () => ({ config: { EMBEDDING_ENDPOINT: undefined, RERANK_ENDPOINT: undefined } }));

    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const healthHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/health')?.[1];
    const res = await healthHandler({ query: { services: 'embedding,reranker' } });

    expect(res.services.embedding).toBe('unknown');
    expect(res.services.reranker).toBe('unknown');
  });

  it('ignores undefined query params when parsing services', async () => {
    const app = fakeApp();
    vi.doMock('../../../../src/db/db', () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({ ok: true }));
    vi.doMock('../../../../src/config/env', () => ({ config: { EMBEDDING_ENDPOINT: 'http://embed/embed' } }));

    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const healthHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/health')?.[1];
    const res = await healthHandler({ query: { services: undefined } });

    expect(res.status).toBe('ok');
  });

  it('parses when query object is missing', async () => {
    const app = fakeApp();
    vi.doMock('../../../../src/db/db', () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({ ok: true }));
    vi.doMock('../../../../src/config/env', () => ({ config: { EMBEDDING_ENDPOINT: 'http://embed/embed' } }));

    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const healthHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/health')?.[1];
    const res = await healthHandler({} as any);
    expect(res.status).toBe('ok');
  });

  it('checks reranker when endpoint is configured', async () => {
    const app = fakeApp();
    vi.doMock('../../../../src/db/db', () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({ ok: true }));
    vi.doMock('../../../../src/config/env', () => ({
      config: { RERANK_ENDPOINT: 'http://rerank/rerank' }
    }));

    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);

    const healthHandler = app.get.mock.calls.find((c: any[]) => c[0] === '/health')?.[1];
    const res = await healthHandler({ query: { services: 'reranker' } });
    expect(res.services.reranker).toBe('ok');
  });
});

