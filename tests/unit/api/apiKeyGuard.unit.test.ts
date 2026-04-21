import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockReply = {
  status: (code: number) => MockReply;
  send: (payload: unknown) => void;
};

describe('apiKeyGuard (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('allows when API_KEY is unset', async () => {
    vi.doMock('../../../src/config/env', () => ({ config: { API_KEY: '' } }));
    const { apiKeyGuard } = await import('../../../src/api/hooks/auth');

    const reply: MockReply = {
      status: vi.fn(() => reply),
      send: vi.fn()
    };

    await apiKeyGuard({ url: '/search', headers: {} } as any, reply as any);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('bypasses /health and /ready even if API_KEY is set', async () => {
    vi.doMock('../../../src/config/env', () => ({ config: { API_KEY: 'k' } }));
    const { apiKeyGuard } = await import('../../../src/api/hooks/auth');

    const reply: MockReply = {
      status: vi.fn(() => reply),
      send: vi.fn()
    };

    await apiKeyGuard({ url: '/health', headers: {} } as any, reply as any);
    await apiKeyGuard({ url: '/ready', headers: {} } as any, reply as any);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('rejects when API_KEY set and header missing/wrong', async () => {
    vi.doMock('../../../src/config/env', () => ({ config: { API_KEY: 'k' } }));
    const { apiKeyGuard } = await import('../../../src/api/hooks/auth');

    const reply: MockReply = {
      status: vi.fn(() => reply),
      send: vi.fn()
    };

    await apiKeyGuard({ url: '/search', headers: {} } as any, reply as any);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'unauthorized' });
  });
});

