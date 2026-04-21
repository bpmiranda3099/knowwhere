import { describe, expect, it } from 'vitest';
import { httpJson } from '../helpers/http';

describe('e2e: health', () => {
  it('GET /health returns ok + services', async () => {
    const { res, json } = await httpJson<{ status: string; services?: Record<string, string> }>(
      '/health?services=api,db'
    );
    expect(res.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.services?.api).toBe('ok');
  });

  it('GET /ready returns ready', async () => {
    const { res, json } = await httpJson<{ status: string }>('/ready');
    expect(res.status).toBe(200);
    expect(json.status).toBe('ready');
  });
});

