// Cloudflare Worker: Stripe checkout -> GitHub repository_dispatch -> emailed fix pack.
// Secrets: STRIPE_WEBHOOK_SECRET and any other key starting STRIPE_WEBHOOK_SECRET
// (each may hold a comma-separated list), GITHUB_TOKEN (fine-grained PAT,
// contents:write), GITHUB_REPO ("owner/name").

const TOLERANCE_SECONDS = 300;

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return hex(sig);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function webhookSecrets(env) {
  return Object.keys(env)
    .filter((key) => key.startsWith('STRIPE_WEBHOOK_SECRET'))
    .map((key) => env[key])
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function verifyStripe(payload, header, secrets) {
  const parts = {};
  for (const piece of String(header).split(',')) {
    const index = piece.indexOf('=');
    if (index > 0) parts[piece.slice(0, index)] = piece.slice(index + 1);
  }
  if (!parts.t || !parts.v1) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;
  const message = `${parts.t}.${payload}`;
  for (const secret of secrets) {
    if (safeEqual(await hmacHex(secret, message), parts.v1)) return true;
  }
  return false;
}

function describeUnverified(payload) {
  try {
    const event = JSON.parse(payload);
    const session = (event.data && event.data.object) || {};
    return `event=${event.id || '?'} type=${event.type || '?'} livemode=${event.livemode} session=${session.id || '-'}`;
  } catch {
    return 'unparseable payload';
  }
}

function pickDomain(session) {
  const meta = session.metadata || {};
  if (meta.domain) return String(meta.domain);
  for (const field of session.custom_fields || []) {
    if (field.key === 'domain' && field.text && field.text.value) return String(field.text.value);
  }
  return null;
}

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
}

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return new Response('cartsignal stripe bridge: ok');
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    const payload = await request.text();
    const signature = request.headers.get('stripe-signature') || '';
    const secrets = webhookSecrets(env);
    if (!secrets.length) return new Response('worker not configured', { status: 500 });
    if (!(await verifyStripe(payload, signature, secrets))) {
      console.log('bad signature', describeUnverified(payload));
      return new Response('bad signature', { status: 400 });
    }

    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return new Response('bad json', { status: 400 });
    }

    if (event.type !== 'checkout.session.completed') {
      console.log('ignored event', event.type);
      return new Response('ignored', { status: 200 });
    }

    const session = event.data.object || {};
    if (session.payment_status && session.payment_status !== 'paid') {
      console.log('not paid', session.id, session.payment_status);
      return new Response('not paid', { status: 200 });
    }

    const email = (session.customer_details && session.customer_details.email) || session.customer_email;
    const domain = normalizeDomain(pickDomain(session));
    console.log('session', session.id, 'domain', domain, 'email', email);
    // 200 so Stripe stops retrying an order no retry can complete; the log is the alert.
    if (!domain || !email) return new Response('missing domain or email', { status: 200 });

    const dispatch = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'cartsignal-worker',
      },
      body: JSON.stringify({ event_type: 'fulfill', client_payload: { domain, email } }),
    });

    if (!dispatch.ok) {
      const detail = await dispatch.text();
      console.log('dispatch failed', dispatch.status, detail.slice(0, 200));
      return new Response(`dispatch failed: ${dispatch.status} ${detail.slice(0, 200)}`, { status: 502 });
    }
    console.log('queued', domain);
    return new Response(`queued ${domain}`, { status: 200 });
  },
};
