import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('fetchPdfText (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns null on non-ok response', async () => {
    vi.doMock('pdf-parse', () => ({ default: vi.fn() }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({ ok: false }));
    const { fetchPdfText } = await import('../../../scripts/utils/pdf');
    await expect(fetchPdfText('http://x')).resolves.toBeNull();
  });

  it('returns trimmed text when parse succeeds', async () => {
    const pdfParse = vi.fn(async () => ({ text: '  hello  ' }));
    vi.doMock('pdf-parse', () => ({ default: pdfParse }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1)
    }));
    const { fetchPdfText } = await import('../../../scripts/utils/pdf');
    await expect(fetchPdfText('http://x')).resolves.toBe('hello');
  });

  it('returns null on exceptions', async () => {
    vi.doMock('pdf-parse', () => ({ default: vi.fn(() => Promise.reject(new Error('bad pdf'))) }));
    // @ts-expect-error test override
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1)
    }));
    const { fetchPdfText } = await import('../../../scripts/utils/pdf');
    await expect(fetchPdfText('http://x')).resolves.toBeNull();
  });
});

