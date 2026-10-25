export function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // A single malformed block should not blank the whole page's markup score.
    }
  }
  return out;
}

export function flattenNodes(blocks) {
  const nodes = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const item of n) walk(item);
      return;
    }
    nodes.push(n);
    for (const value of Object.values(n)) {
      if (value && typeof value === 'object') walk(value);
    }
  };
  for (const block of blocks) walk(block);
  return nodes;
}

export function typesOf(node) {
  if (!node || typeof node !== 'object') return [];
  const t = node['@type'];
  if (Array.isArray(t)) return t.map(String);
  return t ? [String(t)] : [];
}

export function firstOffer(node) {
  if (!node || typeof node !== 'object') return null;
  const o = node.offers;
  if (Array.isArray(o)) return o[0] || null;
  return o && typeof o === 'object' ? o : null;
}

export function hrefs(html, base) {
  const out = [];
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push(new URL(m[1], base).toString());
    } catch {
      // Relative or malformed href — skip.
    }
  }
  return out;
}

export function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
