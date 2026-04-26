import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeApp() {
  return {
    post: vi.fn()
  } as any;
}

function fakeReply() {
  const reply: any = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn(() => reply);
  return reply;
}

describe('search route (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects invalid body', async () => {
    const app = fakeApp();
    const searchMock = vi.fn();
    vi.doMock('../../../../src/services/searchService', () => ({ search: searchMock }));

    const { registerSearchRoutes } = await import('../../../../src/api/routes/search');
    await registerSearchRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/search')?.[2];
    const reply = fakeReply();
    await handler({ body: {} }, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('rejects when yearFrom > yearTo', async () => {
    const app = fakeApp();
    const searchMock = vi.fn();
    vi.doMock('../../../../src/services/searchService', () => ({ search: searchMock }));

    const { registerSearchRoutes } = await import('../../../../src/api/routes/search');
    await registerSearchRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/search')?.[2];
    const reply = fakeReply();
    await handler(
      { body: { q: 'hello', filters: { yearFrom: 2025, yearTo: 2020 } } },
      reply
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: 'yearFrom cannot be greater than yearTo' });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('returns results on success', async () => {
    const app = fakeApp();
    const searchMock = vi.fn().mockResolvedValue([{ id: '1' }]);
    vi.doMock('../../../../src/services/searchService', () => ({ search: searchMock }));

    const { registerSearchRoutes } = await import('../../../../src/api/routes/search');
    await registerSearchRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/search')?.[2];
    const reply = fakeReply();
    await handler({ body: { q: 'hello', mode: 'lexical', level: 'paper' } }, reply);

    expect(reply.send).toHaveBeenCalledWith({ results: [{ id: '1' }], mode: 'lexical', level: 'paper' });
  });
});

