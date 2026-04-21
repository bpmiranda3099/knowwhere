import { describe, expect, it, vi } from 'vitest';
import {
  ensureAuthor,
  ensureSource,
  ensureSubject,
  ensureVenue,
  linkPaperAuthor,
  linkPaperSubject
} from '../../../scripts/utils/ingestDb';

function mockClient() {
  return { query: vi.fn() } as any;
}

describe('ingestDb helpers (unit)', () => {
  it('ensureVenue returns null when name missing', async () => {
    const client = mockClient();
    await expect(ensureVenue(client, null)).resolves.toBeNull();
    await expect(ensureVenue(client, undefined)).resolves.toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });

  it('ensureSource returns existing id when present', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 7 }] });
    await expect(ensureSource(client, 'arxiv')).resolves.toBe(7);
  });

  it('ensureSubject inserts when missing (name fallback to code)', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    client.query.mockResolvedValueOnce({ rows: [{ id: 9 }] });
    await expect(ensureSubject(client, 'cs.CL')).resolves.toBe(9);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('ensureAuthor inserts when missing', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    client.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    await expect(ensureAuthor(client, 'Ada')).resolves.toBe(3);
  });

  it('linkPaperSubject and linkPaperAuthor call query', async () => {
    const client = mockClient();
    client.query.mockResolvedValue({ rows: [] });
    await linkPaperSubject(client, 'p1', 1);
    await linkPaperAuthor(client, 'p1', 2, 0);
    expect(client.query).toHaveBeenCalled();
  });
});

