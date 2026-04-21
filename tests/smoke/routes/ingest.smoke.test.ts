import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from '../helpers/buildTestServer';

describe('routes: ingest', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('POST /ingest validates input', async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: 'POST', url: '/ingest', payload: { source: 'arxiv', query: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /ingest starts job (mocked spawn/fs)', async () => {
    vi.doMock('fs', () => ({ default: { existsSync: vi.fn().mockReturnValue(true) } }));
    vi.doMock('child_process', () => ({
      spawn: vi.fn().mockImplementation(() => {
        const child = new EventEmitter() as unknown as EventEmitter & { pid: number };
        (child as any).pid = 12345;
        return child;
      })
    }));

    const app = await buildTestServer();
    const res = await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: { source: 'arxiv', query: 'cat:cs.CL', count: 1 }
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().pid).toBe(12345);
  });
});

