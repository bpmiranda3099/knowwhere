import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('rerank (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.SKIP_RERANK;
  });

  it('throws when endpoint is unset', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'production', RERANK_ENDPOINT: undefined }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).rejects.toThrow(/RERANK_ENDPOINT is required/);
  });

  it('returns null when disabled via env', async () => {
    process.env.SKIP_RERANK = '1';
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'test', RERANK_ENDPOINT: 'http://rerank' }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).resolves.toBeNull();
  });

  it('returns null when disabled via env=true', async () => {
    process.env.SKIP_RERANK = 'true';
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'test', RERANK_ENDPOINT: 'http://rerank' }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).resolves.toBeNull();
  });

  it('returns null when candidates empty', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'production', RERANK_ENDPOINT: 'http://rerank' }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', [])).resolves.toBeNull();
  });

  it('does not auto-disable in test env unless SKIP_RERANK is set', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'test', RERANK_ENDPOINT: 'http://rerank' }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', [])).resolves.toBeNull();
  });

  it('treats SKIP_RERANK=0 as not disabled', async () => {
    process.env.SKIP_RERANK = '0';
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'test', RERANK_ENDPOINT: 'http://rerank' }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', [])).resolves.toBeNull();
  });

  it('returns scores when service returns ok json', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'production', RERANK_ENDPOINT: 'http://rerank' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ scores: [0.2, 0.1] })
    }));

    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a', 'b'])).resolves.toEqual([0.2, 0.1]);
  });

  it('throws on non-ok response', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'production', RERANK_ENDPOINT: 'http://rerank' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'boom'
    }));

    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).rejects.toThrow(/rerank failed/);
  });

  it('returns null when response json has no scores array', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'production', RERANK_ENDPOINT: 'http://rerank' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({})
    }));

    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).resolves.toBeNull();
  });

  it('wraps fetch exceptions as rerank error', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { NODE_ENV: 'production', RERANK_ENDPOINT: 'http://rerank' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    });

    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).rejects.toThrow(/rerank error: network down/);
  });
});

