import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('buildServer (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registers plugins and routes', async () => {
    const registerHealthRoutes = vi.fn(async () => {});
    const registerStatsRoutes = vi.fn(async () => {});
    const registerLogsRoutes = vi.fn(async () => {});
    const registerIngestRoutes = vi.fn(async () => {});
    const registerEvaluateRoutes = vi.fn(async () => {});
    const registerEmbedRoutes = vi.fn(async () => {});
    const registerRerankRoutes = vi.fn(async () => {});
    const registerSearchRoutes = vi.fn(async () => {});

    const app = {
      register: vi.fn(async () => {}),
      addHook: vi.fn(),
      listen: vi.fn(),
      log: { info: vi.fn() }
    };

    vi.doMock('fastify', () => ({ default: vi.fn(() => app) }));
    vi.doMock('../../../src/config/env', () => ({
      config: {
        NODE_ENV: 'test',
        RATE_LIMIT_MAX: 100,
        RATE_LIMIT_WINDOW: 1000,
        corsOrigins: [],
        PORT: 3000
      }
    }));
    vi.doMock('../../../src/api/routes/health', () => ({ registerHealthRoutes }));
    vi.doMock('../../../src/api/routes/stats', () => ({ registerStatsRoutes }));
    vi.doMock('../../../src/api/routes/logs', () => ({ registerLogsRoutes }));
    vi.doMock('../../../src/api/routes/ingest', () => ({ registerIngestRoutes }));
    vi.doMock('../../../src/api/routes/evaluate', () => ({ registerEvaluateRoutes }));
    vi.doMock('../../../src/api/routes/embed', () => ({ registerEmbedRoutes }));
    vi.doMock('../../../src/api/routes/rerank', () => ({ registerRerankRoutes }));
    vi.doMock('../../../src/api/routes/search', () => ({ registerSearchRoutes }));
    vi.doMock('../../../src/api/hooks/auth', () => ({ apiKeyGuard: vi.fn() }));

    const { buildServer } = await import('../../../src/api/index');
    const built = await buildServer();

    expect(built).toBe(app);
    expect(registerHealthRoutes).toHaveBeenCalled();
    expect(registerSearchRoutes).toHaveBeenCalled();
  });
});

