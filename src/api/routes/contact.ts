import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { config } from '../../config/env';
import { readFile } from 'node:fs/promises';

const contactBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  role: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(250)
});

function isSmtpConfigured() {
  return Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);
}

let cachedLogo: Buffer | null = null;
async function getLogoPng(): Promise<Buffer | null> {
  if (cachedLogo) return cachedLogo;
  try {
    cachedLogo = await readFile('/app/assets/logo.png');
    return cachedLogo;
  } catch {
    return null;
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBrandedShell(opts: { title: string; subtitle: string; bodyHtml: string; footerNote?: string; logo: boolean }) {
  const footer = opts.footerNote
    ? `<div style="margin-top:14px;padding:12px 14px;border-radius:0;background:rgba(133,0,222,0.12);border:1px solid rgba(133,0,222,0.25);color:rgba(255,255,255,0.88);font-size:12px;line-height:1.5;">${opts.footerNote}</div>`
    : '';
  return `
    <div style="background:#1f1f21;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:680px;margin:0 auto;background:#151516;border:1px solid rgba(255,255,255,0.10);border-radius:0;overflow:hidden;">
        <div style="padding:18px 20px;background:#8500de;">
          <div style="display:flex;align-items:center;gap:14px;">
            ${opts.logo ? `<img src="cid:kw-logo" alt="KnowWhere" style="height:34px;width:auto;display:block;filter:drop-shadow(0 6px 18px rgba(0,0,0,0.35));"/>` : ''}
            <div style="color:#ffffff;font-weight:800;font-size:18px;letter-spacing:0.2px;line-height:1.2;">
              ${opts.title}
              <div style="color:rgba(255,255,255,0.85);font-weight:600;font-size:12px;margin-top:3px;">${opts.subtitle}</div>
            </div>
          </div>
        </div>
        <div style="padding:20px;color:#ffffff;">
          ${opts.bodyHtml}
          ${footer}
        </div>
        <div style="padding:14px 20px;border-top:1px solid rgba(255,255,255,0.10);color:#a1a1aa;font-size:12px;">
          Sent by KnowWhere • ${formatSentAt(new Date())}
        </div>
      </div>
    </div>
  `;
}

function formatSentAt(d: Date) {
  // Human-friendly, predictable timezone (UTC) to avoid server-local ambiguity.
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  }).format(d);
}

export async function registerContactRoutes(app: FastifyInstance): Promise<void> {
  app.post('/contact', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!isSmtpConfigured()) {
      return reply.status(501).send({ error: 'contact_not_configured' });
    }

    const parsed = contactBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST!,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: { user: config.SMTP_USER!, pass: config.SMTP_PASS! }
    });

    const subject = `[CONTACT] KnowWhere ${parsed.data.name} (${parsed.data.role})`;
    const text = `Name: ${parsed.data.name}\nEmail: ${parsed.data.email}\nRole: ${parsed.data.role}\n\nMessage:\n${parsed.data.message}\n`;
    const safeName = escapeHtml(parsed.data.name);
    const safeEmail = escapeHtml(parsed.data.email);
    const safeRole = escapeHtml(parsed.data.role);
    const safeMessage = escapeHtml(parsed.data.message).replace(/\n/g, '<br/>');
    const logo = await getLogoPng();

    const adminBody = `
      <div style="padding:14px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:0;margin-bottom:14px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:0 0 10px 0;color:#ff4d4d;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;width:90px;">Name</td>
            <td style="padding:0 0 10px 0;color:#ffffff;font-size:15px;font-weight:700;">${safeName}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 0 10px 0;">
              <div style="height:1px;background:rgba(255,255,255,0.10);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 10px 0;color:#ff4d4d;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;width:90px;">Email</td>
            <td style="padding:0 0 10px 0;color:#ffffff;font-size:15px;font-weight:700;">
              <a href="mailto:${safeEmail}" style="color:#ffffff;text-decoration:none;">${safeEmail}</a>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 0 10px 0;">
              <div style="height:1px;background:rgba(255,255,255,0.10);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:0;color:#ff4d4d;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;width:90px;">Role</td>
            <td style="padding:0;color:#ffffff;font-size:15px;font-weight:700;">${safeRole}</td>
          </tr>
        </table>
      </div>
      <div style="padding:14px 16px;background:#111;border:1px solid rgba(255,255,255,0.12);border-radius:0;">
        <div style="color:#008ae3;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:8px;">Message</div>
        <div style="color:#ffffff;font-size:14px;line-height:1.65;white-space:normal;">${safeMessage}</div>
      </div>
    `;

    const adminHtml = buildBrandedShell({
      title: '',
      subtitle: '',
      bodyHtml: adminBody,
      logo: Boolean(logo)
    });

    const confirmSubject = '[NOREPLY] Thanks for contacting KnowWhere';
    const confirmText = `Hi ${parsed.data.name},\n\nThanks for reaching out to KnowWhere. We received your message and will get back to you soon.\n\n— KnowWhere Team\n`;
    const confirmBody = `
      <div style="padding:14px 16px;background:#111;border:1px solid rgba(255,255,255,0.12);border-radius:0;">
        <div style="color:#008ae3;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:8px;">Thank you</div>
        <div style="color:#ffffff;font-size:14px;line-height:1.65;">
          Hi <b>${safeName}</b>,<br/><br/>
          Thanks for reaching out to KnowWhere. We received your message and we’ll get back to you soon.
        </div>
      </div>
      <div style="margin-top:12px;padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:0;">
        <div style="color:#ff4d4d;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:6px;">Copy of your message</div>
        <div style="color:#ffffff;font-size:13px;line-height:1.6;">${safeMessage}</div>
      </div>
    `;
    const confirmHtml = buildBrandedShell({
      title: '',
      subtitle: '',
      bodyHtml: confirmBody,
      footerNote: 'If you didn’t send this message, you can ignore this email.',
      logo: Boolean(logo)
    });

    const attachments = logo
      ? [
          {
            filename: 'logo.png',
            content: logo,
            cid: 'kw-logo'
          }
        ]
      : undefined;

    try {
      await transporter.sendMail({
        from: config.SMTP_FROM || config.SMTP_USER!,
        to: config.CONTACT_TO,
        subject,
        text,
        html: adminHtml,
        replyTo: parsed.data.email,
        attachments
      });
    } catch (err: any) {
      app.log.error({ err }, 'contact: failed to send admin email');
      return reply.status(502).send({
        error: 'smtp_send_failed',
        stage: 'admin',
        message: err?.message ? String(err.message) : 'unknown'
      });
    }

    try {
      await transporter.sendMail({
        from: config.SMTP_FROM || config.SMTP_USER!,
        to: parsed.data.email,
        subject: confirmSubject,
        text: confirmText,
        html: confirmHtml,
        attachments
      });
    } catch (err: any) {
      app.log.error({ err }, 'contact: failed to send confirmation email');
      return reply.status(502).send({
        error: 'smtp_send_failed',
        stage: 'confirm',
        message: err?.message ? String(err.message) : 'unknown'
      });
    }

    return reply.send({ ok: true });
  });
}

