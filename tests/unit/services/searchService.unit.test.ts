import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('search (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.DEBUG_SEARCH;
  });

  it('lexical mode does not call embedText and returns rows', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        { id: '1', title: 't', abstract: 'a', doi: null, url: null, subjects: null, source: null, snippet: 's', hybrid_score: 1 }
      ]
    });
    const embedMock = vi.fn();
    const rerankMock = vi.fn();

    vi.doMock('../../../src/db/db', () => ({ query: queryMock }));
    vi.doMock('../../../src/services/embeddingClient', () => ({ embedText: embedMock }));
    vi.doMock('../../../src/services/rerankService', () => ({ rerank: rerankMock }));

    const { search } = await import('../../../src/services/searchService');
    const res = await search({ q: 'hello', mode: 'lexical', level: 'paper', limit: 5 });
    expect(embedMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalled();
    expect(res[0].id).toBe('1');
  });

  it('hybrid mode calls embedText and reranks top results when scores returned', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        { id: 'a', title: 't', abstract: 'a', doi: null, url: null, subjects: null, source: null, snippet: 'doc A', hybrid_score: 0.1 },
        { id: 'b', title: 't', abstract: 'a', doi: null, url: null, subjects: null, source: null, snippet: 'doc B', hybrid_score: 0.2 }
      ]
    });
    const embedMock = vi.fn().mockResolvedValue([0.1]);
    const rerankMock = vi.fn().mockResolvedValue([0.1, 0.9]);

    vi.doMock('../../../src/db/db', () => ({ query: queryMock }));
    vi.doMock('../../../src/services/embeddingClient', () => ({ embedText: embedMock }));
    vi.doMock('../../../src/services/rerankService', () => ({ rerank: rerankMock }));

    const { search } = await import('../../../src/services/searchService');
    const res = await search({ q: 'hello', mode: 'hybrid', level: 'paper', limit: 5 });
    expect(embedMock).toHaveBeenCalled();
    expect(rerankMock).toHaveBeenCalled();
    // rerank scores reorder candidates: b should come first
    expect(res[0].id).toBe('b');
  });
});

