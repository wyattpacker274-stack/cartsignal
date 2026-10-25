import nodemailer from 'nodemailer';
import { config } from '../config.js';

const ENDPOINT = 'https://api.resend.com/emails';

async function sendGmail({ recipients, subject, html, text, attachments, replyTo, from }) {
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;
  if (!user || !password) return { sent: false, reason: 'GMAIL_USER and GMAIL_APP_PASSWORD must both be set' };

  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: password.replace(/\s/g, '') },
  });
  const message = {
    from: from || `${config.brand} <${user}>`,
    to: recipients,
    subject,
    html,
    text,
    attachments: (attachments || []).map((attachment) => ({
      filename: attachment.filename,
      content: Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(String(attachment.content)),
    })),
  };
  if (replyTo) message.replyTo = replyTo;

  try {
    const result = await transport.sendMail(message);
    return { sent: true, id: result.messageId };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendMail({ to, subject, html, text, attachments, replyTo, from }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: 'no recipient' };
  if (process.env.GMAIL_USER || process.env.GMAIL_APP_PASSWORD) {
    return sendGmail({ recipients, subject, html, text, attachments, replyTo, from });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'Gmail SMTP or RESEND_API_KEY must be configured' };

  const body = {
    from: from || config.fromEmail,
    to: recipients,
    subject,
    html,
    text,
  };
  if (attachments && attachments.length) {
    body.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content))).toString('base64'),
    }));
  }
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { sent: false, reason: payload.message || `HTTP ${res.status}` };
  return { sent: true, id: payload.id };
}
