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

  it('returns fusion-ranked results when rerank throws', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'a',
          title: 't1',
          abstract: 'x',
          doi: null,
          url: null,
          subjects: null,
          source: null,
          snippet: 's1',
          hybrid_score: 0.1
        },
        {
          id: 'b',
          title: 't2',
          abstract: 'x',
          doi: null,
          url: null,
          subjects: null,
          source: null,
          snippet: 's2',
          hybrid_score: 0.9
        }
      ]
    });
    const embedMock = vi.fn().mockResolvedValue([0.1]);
    const rerankMock = vi.fn().mockRejectedValue(new Error('rerank failed (500): Internal Server Error'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('../../../src/db/db', () => ({ query: queryMock }));
    vi.doMock('../../../src/services/embeddingClient', () => ({ embedText: embedMock }));
    vi.doMock('../../../src/services/rerankService', () => ({ rerank: rerankMock }));

    const { search } = await import('../../../src/services/searchService');
    const res = await search({ q: 'hello', mode: 'hybrid', level: 'paper', limit: 5 });
    errSpy.mockRestore();
    expect(rerankMock).toHaveBeenCalled();
    expect(res.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('hybrid mode calls embedText and reranks top results when scores returned', async () => {
    const longAb = 'x'.repeat(120);
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'a',
          title: 't1',
          abstract: longAb,
          doi: null,
          url: null,
          subjects: null,
          source: null,
          snippet: 'doc A',
          hybrid_score: 0.1
        },
        {
          id: 'b',
          title: 't2',
          abstract: longAb,
          doi: null,
          url: null,
          subjects: null,
          source: null,
          snippet: 'doc B',
          hybrid_score: 0.2
        }
      ]
    });
    const embedMock = vi.fn().mockResolvedValue([0.1]);
    // Candidates are re-sorted by hybrid (b then a); score b high so rerank still promotes b.
    const rerankMock = vi.fn().mockResolvedValue([0.9, 0.1]);

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

  it('dedupes same title (different DOIs) keeping stronger hybrid_score', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'x1',
          title: 'Experimentation in Software Engineering',
          abstract: 'Short',
          doi: '10.1007/a',
          url: null,
          subjects: null,
          source: null,
          snippet: 's1',
          hybrid_score: 0.2
        },
        {
          id: 'x2',
          title: 'Experimentation in Software Engineering',
          abstract: 'Longer abstract',
          doi: '10.1007/b',
          url: null,
          subjects: null,
          source: null,
          snippet: 's2',
          hybrid_score: 0.8
        }
      ]
    });
    const embedMock = vi.fn().mockResolvedValue([0.1]);
    const rerankMock = vi.fn().mockResolvedValue([0.9]);

    vi.doMock('../../../src/db/db', () => ({ query: queryMock }));
    vi.doMock('../../../src/services/embeddingClient', () => ({ embedText: embedMock }));
    vi.doMock('../../../src/services/rerankService', () => ({ rerank: rerankMock }));

    const { search } = await import('../../../src/services/searchService');
    const res = await search({ q: 'hello', mode: 'hybrid', level: 'paper', limit: 10 });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('x2');
    expect(rerankMock).toHaveBeenCalledWith('hello', ['s2']);
  });

  it('hybrid heuristic reorders stub semantic-only rows below substantive abstracts', async () => {
    process.env.RERANK_ABSTAIN = '0';
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'thin',
          title: 'Machine learning',
          abstract: 'Machine learning',
          doi: '10.1/thin',
          url: null,
          subjects: null,
          source: null,
          snippet: 'Machine learning',
          lex_score: null,
          sem_score: 0.72,
          hybrid_score: 0.58
        },
        {
          id: 'fat',
          title: 'Traffic control with RL',
          abstract: 'A'.repeat(200),
          doi: '10.1/fat',
          url: null,
          subjects: null,
          source: null,
          snippet: 'A'.repeat(200),
          lex_score: null,
          sem_score: 0.65,
          hybrid_score: 0.54
        }
      ]
    });
    const embedMock = vi.fn().mockResolvedValue([0.1]);
    const rerankMock = vi.fn().mockResolvedValue([0.92, 0.4]);

    vi.doMock('../../../src/db/db', () => ({ query: queryMock }));
    vi.doMock('../../../src/services/embeddingClient', () => ({ embedText: embedMock }));
    vi.doMock('../../../src/services/rerankService', () => ({ rerank: rerankMock }));

    const { search } = await import('../../../src/services/searchService');
    const res = await search({ q: 'traffic', mode: 'hybrid', level: 'paper', limit: 10 });
    delete process.env.RERANK_ABSTAIN;
    expect(res[0].id).toBe('fat');
    expect(res[1].id).toBe('thin');
  });
});

