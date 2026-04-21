import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('rerank (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.SKIP_RERANK;
  });

  it('returns null when endpoint is unset', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { RERANK_ENDPOINT: undefined }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).resolves.toBeNull();
  });

  it('returns null when disabled via env', async () => {
    process.env.SKIP_RERANK = '1';
    vi.doMock('../../../src/config/env', () => ({
      config: { RERANK_ENDPOINT: 'http://rerank' }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).resolves.toBeNull();
  });

  it('returns null when candidates empty', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { RERANK_ENDPOINT: 'http://rerank' }
    }));
    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', [])).resolves.toBeNull();
  });

  it('returns scores when service returns ok json', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { RERANK_ENDPOINT: 'http://rerank' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ scores: [0.2, 0.1] })
    }));

    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a', 'b'])).resolves.toEqual([0.2, 0.1]);
  });

  it('returns null on non-ok response', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { RERANK_ENDPOINT: 'http://rerank' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'boom'
    }));

    const { rerank } = await import('../../../src/services/rerankService');
    await expect(rerank('q', ['a'])).resolves.toBeNull();
  });
});

