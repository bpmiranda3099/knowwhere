import { describe, expect, it } from 'vitest';
import { http } from '../helpers/http';

describe('e2e: ingest', () => {
  it('POST /ingest validates input (400)', async () => {
    const res = await http('/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'arxiv', query: '' })
    });
    expect(res.status).toBe(400);
  });

  // Note: we intentionally do NOT run a successful ingest here because it can trigger
  // external network calls + long-running background jobs. This remains an e2e validation
  // of the deployed route + schema.
});

