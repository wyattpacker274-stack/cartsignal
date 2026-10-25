import { config } from '../config.js';

const ENDPOINT = 'https://api.resend.com/emails';

export async function sendMail({ to, subject, html, text, attachments, replyTo, from }) {
  const key = process.env.RESEND_API_KEY;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: 'no recipient' };
  if (!key) return { sent: false, reason: 'RESEND_API_KEY not set' };

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
