import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('embedText (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns first vector from {embeddings:[[...]]}', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { EMBEDDING_ENDPOINT: 'http://embed', EMBEDDING_MODEL: 'm' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [[1, 2, 3]] })
    }));

    const { embedText } = await import('../../../src/services/embeddingClient');
    await expect(embedText('hi')).resolves.toEqual([1, 2, 3]);
  });

  it('returns first vector from {data:[{embedding:[...]}]}', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { EMBEDDING_ENDPOINT: 'http://embed', EMBEDDING_MODEL: 'm' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [4, 5] }] })
    }));

    const { embedText } = await import('../../../src/services/embeddingClient');
    await expect(embedText('hi')).resolves.toEqual([4, 5]);
  });

  it('returns vector from {vector:[...]}', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { EMBEDDING_ENDPOINT: 'http://embed', EMBEDDING_MODEL: 'm' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ vector: [9] })
    }));

    const { embedText } = await import('../../../src/services/embeddingClient');
    await expect(embedText('hi')).resolves.toEqual([9]);
  });

  it('throws on unsupported shape', async () => {
    vi.doMock('../../../src/config/env', () => ({
      config: { EMBEDDING_ENDPOINT: 'http://embed', EMBEDDING_MODEL: 'm' }
    }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ nope: true })
    }));

    const { embedText } = await import('../../../src/services/embeddingClient');
    await expect(embedText('hi')).rejects.toThrow(/Unsupported embedding response shape/);
  });
});

