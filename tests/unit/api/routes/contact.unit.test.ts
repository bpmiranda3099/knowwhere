import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeApp() {
  return {
    post: vi.fn(),
    log: { error: vi.fn() }
  } as any;
}

function fakeReply() {
  const reply: any = {};
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn(() => reply);
  return reply;
}

describe('contact route (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 501 when SMTP not configured', async () => {
    const app = fakeApp();
    vi.doMock('../../../../src/config/env', () => ({
      config: { SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];
    const reply = fakeReply();
    await handler({ body: {} }, reply);

    expect(reply.status).toHaveBeenCalledWith(501);
    expect(reply.send).toHaveBeenCalledWith({ error: 'contact_not_configured' });
  });

  it('returns 400 on invalid body', async () => {
    const app = fakeApp();
    vi.doMock('../../../../src/config/env', () => ({
      config: { SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];
    const reply = fakeReply();
    await handler({ body: { name: '', email: 'nope', role: '', message: '' } }, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_body' }));
  });

  it('returns 502 stage=admin when admin email fails', async () => {
    const app = fakeApp();
    const sendMail = vi.fn(async () => {
      throw new Error('smtp down');
    });

    vi.doMock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));
    vi.doMock('node:fs/promises', () => ({ readFile: vi.fn(async () => Buffer.from('x')) }));
    vi.doMock('../../../../src/config/env', () => ({
      config: {
        SMTP_HOST: 'h',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        CONTACT_TO: 'admin@example.com'
      }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];
    const reply = fakeReply();
    await handler({ body: { name: 'A', email: 'a@b.com', role: 'R', message: 'M' } }, reply);

    expect(reply.status).toHaveBeenCalledWith(502);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'smtp_send_failed', stage: 'admin' }));
  });

  it('returns 502 stage=confirm when confirm email fails', async () => {
    const app = fakeApp();
    const sendMail = vi.fn()
      .mockResolvedValueOnce(undefined) // admin
      .mockRejectedValueOnce(new Error('smtp down')); // confirm

    vi.doMock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));
    vi.doMock('node:fs/promises', () => ({ readFile: vi.fn(async () => Buffer.from('x')) }));
    vi.doMock('../../../../src/config/env', () => ({
      config: {
        SMTP_HOST: 'h',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        CONTACT_TO: 'admin@example.com'
      }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];
    const reply = fakeReply();
    await handler({ body: { name: 'A', email: 'a@b.com', role: 'R', message: 'M' } }, reply);

    expect(reply.status).toHaveBeenCalledWith(502);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'smtp_send_failed', stage: 'confirm' }));
  });

  it('returns ok on success and escapes HTML in message', async () => {
    const app = fakeApp();
    const sendMail = vi.fn().mockResolvedValue(undefined);

    vi.doMock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));
    vi.doMock('node:fs/promises', () => ({ readFile: vi.fn(async () => null) }));
    vi.doMock('../../../../src/config/env', () => ({
      config: {
        SMTP_HOST: 'h',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        CONTACT_TO: 'admin@example.com'
      }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];
    const reply = fakeReply();
    await handler(
      { body: { name: 'A', email: 'a@b.com', role: 'R', message: '<script>\nX</script>' } },
      reply
    );

    expect(reply.send).toHaveBeenCalledWith({ ok: true });
    expect(sendMail).toHaveBeenCalledTimes(2);
    const adminCall = sendMail.mock.calls[0]?.[0];
    expect(String(adminCall.html)).toMatch(/&lt;script&gt;<br\/>X&lt;\/script&gt;/);
  });

  it('handles missing/unreadable logo file (no attachments)', async () => {
    const app = fakeApp();
    const sendMail = vi.fn().mockResolvedValue(undefined);

    vi.doMock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));
    vi.doMock('node:fs/promises', () => ({ readFile: vi.fn(async () => Promise.reject(new Error('no file'))) }));
    vi.doMock('../../../../src/config/env', () => ({
      config: {
        SMTP_HOST: 'h',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        CONTACT_TO: 'admin@example.com'
      }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];
    const reply = fakeReply();
    await handler({ body: { name: 'A', email: 'a@b.com', role: 'R', message: 'M' } }, reply);

    expect(reply.send).toHaveBeenCalledWith({ ok: true });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0]?.[0]?.attachments).toBeUndefined();
    expect(sendMail.mock.calls[1]?.[0]?.attachments).toBeUndefined();
  });

  it('caches logo after first successful read', async () => {
    const app = fakeApp();
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn(async () => Buffer.from('logo'));

    vi.doMock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));
    vi.doMock('node:fs/promises', () => ({ readFile }));
    vi.doMock('../../../../src/config/env', () => ({
      config: {
        SMTP_HOST: 'h',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        CONTACT_TO: 'admin@example.com'
      }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);
    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];

    const reply1 = fakeReply();
    await handler({ body: { name: 'A', email: 'a@b.com', role: 'R', message: 'M' } }, reply1);
    const reply2 = fakeReply();
    await handler({ body: { name: 'A', email: 'a@b.com', role: 'R', message: 'M' } }, reply2);

    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('returns unknown error message when sendMail throws without message', async () => {
    const app = fakeApp();
    const sendMail = vi.fn(async () => {
      throw {};
    });

    vi.doMock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));
    vi.doMock('node:fs/promises', () => ({ readFile: vi.fn(async () => null) }));
    vi.doMock('../../../../src/config/env', () => ({
      config: {
        SMTP_HOST: 'h',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        CONTACT_TO: 'admin@example.com'
      }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];
    const reply = fakeReply();
    await handler({ body: { name: 'A', email: 'a@b.com', role: 'R', message: 'M' } }, reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'smtp_send_failed', stage: 'admin', message: 'unknown' })
    );
  });

  it('returns unknown error message when confirm email fails without message', async () => {
    const app = fakeApp();
    const sendMail = vi.fn()
      .mockResolvedValueOnce(undefined) // admin ok
      .mockRejectedValueOnce({}); // confirm fails without message

    vi.doMock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));
    vi.doMock('node:fs/promises', () => ({ readFile: vi.fn(async () => null) }));
    vi.doMock('../../../../src/config/env', () => ({
      config: {
        SMTP_HOST: 'h',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        CONTACT_TO: 'admin@example.com'
      }
    }));

    const { registerContactRoutes } = await import('../../../../src/api/routes/contact');
    await registerContactRoutes(app);

    const handler = app.post.mock.calls.find((c: any[]) => c[0] === '/contact')?.[2];
    const reply = fakeReply();
    await handler({ body: { name: 'A', email: 'a@b.com', role: 'R', message: 'M' } }, reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'smtp_send_failed', stage: 'confirm', message: 'unknown' })
    );
  });
});

