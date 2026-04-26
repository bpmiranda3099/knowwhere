import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeApp() {
  return {
    post: vi.fn(),
    log: { info: vi.fn() }
  } as any;
}

function fakeReply() {
  const reply: any = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn(() => reply);
  return reply;
}

describe('ingest route (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects invalid body', async () => {
    const app = fakeApp();
    const { registerIngestRoutes } = await import('../../../../src/api/routes/ingest');
    await registerIngestRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/ingest')?.[2];
    const reply = fakeReply();
    await handler({ body: {} }, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 when script not found', async () => {
    const app = fakeApp();

    vi.doMock('fs', () => ({ default: { existsSync: vi.fn(() => false) }, existsSync: vi.fn(() => false) }));

    const { registerIngestRoutes } = await import('../../../../src/api/routes/ingest');
    await registerIngestRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/ingest')?.[2];
    const reply = fakeReply();
    await handler({ body: { source: 'arxiv', query: 'x', count: 1 } }, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
  });

  it('returns 202 with pid when spawned', async () => {
    const app = fakeApp();

    vi.doMock('fs', () => ({ default: { existsSync: vi.fn(() => true) }, existsSync: vi.fn(() => true) }));
    const onMock = vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'exit') cb(0);
    });
    vi.doMock('child_process', () => ({
      spawn: vi.fn(() => ({ pid: 123, on: onMock }))
    }));

    const { registerIngestRoutes } = await import('../../../../src/api/routes/ingest');
    await registerIngestRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/ingest')?.[2];
    const reply = fakeReply();
    await handler({ body: { source: 'arxiv', query: 'x', count: 2 } }, reply);

    expect(reply.status).toHaveBeenCalledWith(202);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Ingest started', source: 'arxiv', query: 'x', count: 2, pid: 123 })
    );
    expect(app.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'arxiv', query: 'x', count: 2, status: 'completed' }),
      'ingest job finished'
    );
  });

  it('logs failed status when child exits non-zero', async () => {
    const app = fakeApp();

    vi.doMock('fs', () => ({ default: { existsSync: vi.fn(() => true) }, existsSync: vi.fn(() => true) }));
    const onMock = vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'exit') cb(2);
    });
    vi.doMock('child_process', () => ({
      spawn: vi.fn(() => ({ pid: 999, on: onMock }))
    }));

    const { registerIngestRoutes } = await import('../../../../src/api/routes/ingest');
    await registerIngestRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/ingest')?.[2];
    const reply = fakeReply();
    await handler({ body: { source: 'openalex', query: 'y', count: 1 } }, reply);

    expect(app.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'openalex', query: 'y', count: 1, status: 'failed (code 2)' }),
      'ingest job finished'
    );
  });
});

