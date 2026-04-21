import { describe, expect, it, vi } from 'vitest';
import { buildIngestSummary, runSelectedIngest } from '../../../scripts/ingest/shared';

describe('interactive ingest helpers (unit)', () => {
  it('builds a readable summary with source-specific pacing', () => {
    expect(
      buildIngestSummary({
        source: 'arxiv',
        query: 'machine learning',
        quantity: 25,
        pacingMs: 3000
      })
    ).toContain('arXiv');
    expect(
      buildIngestSummary({
        source: 'arxiv',
        query: 'machine learning',
        quantity: 25,
        pacingMs: 3000
      })
    ).toContain('1 request every 3.0s');
  });

  it('dispatches to the selected runner', async () => {
    const runners = {
      arxiv: vi.fn().mockResolvedValue(undefined),
      crossref: vi.fn().mockResolvedValue(undefined),
      openalex: vi.fn().mockResolvedValue(undefined)
    };

    await runSelectedIngest(
      {
        source: 'crossref',
        query: 'nlp',
        quantity: 10,
        pacingMs: 1000
      },
      runners
    );

    expect(runners.crossref).toHaveBeenCalledWith({
      query: 'nlp',
      quantity: 10,
      pacingMs: 1000
    });
    expect(runners.arxiv).not.toHaveBeenCalled();
    expect(runners.openalex).not.toHaveBeenCalled();
  });

  it('does not auto-run source CLIs when imported for the interactive flow', async () => {
    vi.resetModules();

    const fetchWithRetry = vi.fn().mockResolvedValue({
      json: async () => ({ results: [] })
    });

    vi.doMock('../../../src/db/db', () => ({
      closePool: vi.fn(),
      getClient: vi.fn().mockResolvedValue({
        query: vi.fn(),
        release: vi.fn()
      })
    }));
    vi.doMock('../../../src/services/embeddingClient', () => ({
      embedText: vi.fn().mockResolvedValue([0.1, 0.2])
    }));
    vi.doMock('../../../scripts/utils/chunk', () => ({
      chunkText: vi.fn().mockReturnValue([])
    }));
    vi.doMock('../../../scripts/utils/retry', () => ({
      fetchWithRetry
    }));
    vi.doMock('../../../scripts/utils/pdf', () => ({
      fetchPdfText: vi.fn().mockResolvedValue(null)
    }));
    vi.doMock('../../../scripts/utils/rateLimit', () => ({
      pause: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock('../../../scripts/utils/ingestDb', () => ({
      ensureAuthor: vi.fn(),
      ensureSource: vi.fn(),
      ensureSubject: vi.fn(),
      ensureVenue: vi.fn(),
      linkPaperAuthor: vi.fn(),
      linkPaperSubject: vi.fn()
    }));

    await import('../../../scripts/ingest/ingestOpenAlex');

    expect(fetchWithRetry).not.toHaveBeenCalled();
  });
});
