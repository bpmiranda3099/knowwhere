import { describe, expect, it, vi } from 'vitest';

function fakeApp() {
  return {
    get: vi.fn(),
    post: vi.fn()
  } as any;
}

describe('route registrars (unit)', () => {
  it('registerHealthRoutes registers /health and /ready', async () => {
    const app = fakeApp();
    const { registerHealthRoutes } = await import('../../../../src/api/routes/health');
    await registerHealthRoutes(app);
    expect(app.get).toHaveBeenCalledWith('/health', expect.any(Function));
    expect(app.get).toHaveBeenCalledWith('/ready', expect.any(Function));
  });

  it('registerSearchRoutes registers /search', async () => {
    const app = fakeApp();
    const { registerSearchRoutes } = await import('../../../../src/api/routes/search');
    await registerSearchRoutes(app);
    expect(app.post).toHaveBeenCalledWith('/search', expect.anything(), expect.any(Function));
  });

  it('registerEmbedRoutes registers /embed', async () => {
    const app = fakeApp();
    const { registerEmbedRoutes } = await import('../../../../src/api/routes/embed');
    await registerEmbedRoutes(app);
    expect(app.post).toHaveBeenCalledWith('/embed', expect.any(Function));
  });

  it('registerRerankRoutes registers /rerank', async () => {
    const app = fakeApp();
    const { registerRerankRoutes } = await import('../../../../src/api/routes/rerank');
    await registerRerankRoutes(app);
    expect(app.post).toHaveBeenCalledWith('/rerank', expect.any(Function));
  });

  it('registerStatsRoutes registers /stats', async () => {
    const app = fakeApp();
    const { registerStatsRoutes } = await import('../../../../src/api/routes/stats');
    await registerStatsRoutes(app);
    expect(app.get).toHaveBeenCalledWith('/stats', expect.any(Function));
  });

  it('registerLogsRoutes registers /logs', async () => {
    const app = fakeApp();
    const { registerLogsRoutes } = await import('../../../../src/api/routes/logs');
    await registerLogsRoutes(app);
    expect(app.get).toHaveBeenCalledWith('/logs', expect.any(Function));
  });

  it('registerIngestRoutes registers /ingest', async () => {
    const app = fakeApp();
    const { registerIngestRoutes } = await import('../../../../src/api/routes/ingest');
    await registerIngestRoutes(app);
    expect(app.post).toHaveBeenCalledWith('/ingest', expect.anything(), expect.any(Function));
  });

  it('registerEvaluateRoutes registers /evaluate', async () => {
    const app = fakeApp();
    const { registerEvaluateRoutes } = await import('../../../../src/api/routes/evaluate');
    await registerEvaluateRoutes(app);
    expect(app.post).toHaveBeenCalledWith('/evaluate', expect.anything(), expect.any(Function));
  });
});

