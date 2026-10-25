const DEFAULT_UA = 'CartSignalBot/0.1 (+https://cartsignal.dev/bot; agent-readiness audit)';
const MAX_BYTES = 2 * 1024 * 1024;

async function readCapped(res, cap) {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = cap - total;
    if (value.byteLength >= remaining) {
      chunks.push(Buffer.from(value.subarray(0, remaining)));
      await reader.cancel().catch(() => {});
      return { text: Buffer.concat(chunks).toString('utf8'), truncated: true };
    }
    chunks.push(Buffer.from(value));
    total += value.byteLength;
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated: false };
}

export async function fetchDoc(url, opts = {}) {
  const { ua = DEFAULT_UA, timeoutMs = 12000, method = 'GET' } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': ua,
        accept: 'text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
      },
    });
    const { text, truncated } = await readCapped(res, MAX_BYTES);
    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      headers: Object.fromEntries(res.headers),
      body: text,
      truncated,
      ms: Date.now() - started,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      headers: {},
      body: '',
      truncated: false,
      ms: Date.now() - started,
      error: String((err && err.message) || err),
    };
  } finally {
    clearTimeout(timer);
  }
}
