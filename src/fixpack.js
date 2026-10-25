import { gaps } from './checks.js';
import { escapeHtml } from './html.js';
import { config } from './config.js';

function purchaseTarget() {
  if (config.checkoutUrl) return config.checkoutUrl;
  if (config.ownerEmail) return `mailto:${config.ownerEmail}?subject=${encodeURIComponent('Agent readiness fix pack')}`;
  return '#plan';
}

function brandName(record) {
  if (record.meta && record.meta.orgName) return record.meta.orgName;
  const root = record.domain.split('.')[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function brandDescription(record) {
  if (record.meta && record.meta.description) return record.meta.description;
  return `${brandName(record)} sells direct to customers online.`;
}

export function buildLlmsTxt(record) {
  const name = brandName(record);
  const description = brandDescription(record);
  const sameAs = (record.meta && record.meta.sameAs) || [];
  const lines = [
    `# ${name}`,
    '',
    `> ${description}`,
    '',
    `Canonical storefront: ${record.origin}`,
    '',
    '## Catalog',
    `- [All products](${record.origin}/products.json): public JSON catalog with price, availability, variants, and images.`,
    `- [Sitemap](${record.origin}/sitemap.xml): every indexable URL, including product pages.`,
    '',
    '## Policies',
    `- [Shipping](${record.origin}/policies/shipping-policy): dispatch windows, regions, and rates.`,
    `- [Returns](${record.origin}/policies/refund-policy): return window, condition, and refund timing.`,
    `- [Privacy](${record.origin}/policies/privacy-policy): data collected and how it is used.`,
    '',
    '## Contact',
    `- [Support](${record.origin}/pages/contact): human contact channel and response target.`,
    '',
    '## Machine notes',
    '- Product pages carry schema.org Product JSON-LD with offers, price, currency, and availability.',
    "- Autonomous shopping agents may read this site's public catalog and policy pages.",
    '- Product identifiers include SKU so agents can match listings across merchants.',
  ];
  if (sameAs.length) {
    lines.push('', '## Elsewhere', ...sameAs.map((u) => `- ${u}`));
  }
  return lines.join('\n') + '\n';
}

export function buildRobotsAdditions(record) {
  const lines = [
    '# --- CartSignal: agent access ---',
    '# Retrieval agents must be allowed to read products and policies.',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    '# Training crawlers are a separate policy decision; retrieval is not.',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    '# --- end CartSignal ---',
    '',
  ];
  return lines.join('\n');
}

export function buildSchemaBlock(record) {
  const name = brandName(record);
  const url = record.origin;
  const logo = (record.meta && record.meta.logo) || '';
  const description = brandDescription(record);
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
    description,
    ...(logo ? { logo } : {}),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        url: `${url}/pages/contact`,
        availableLanguage: ['en'],
      },
    ],
    sameAs: (record.meta && record.meta.sameAs) || [],
  };
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'REPLACE: product name',
    description: 'REPLACE: one accurate sentence about what this product is.',
    sku: 'REPLACE-SKU',
    gtin13: 'REPLACE-OR-DELETE',
    image: ['https://REPLACE/cdn/product-image.jpg'],
    brand: { '@type': 'Brand', name },
    offers: {
      '@type': 'Offer',
      url: `${url}/products/REPLACE-HANDLE`,
      price: '0.00',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      priceValidUntil: '2030-12-31',
      seller: { '@type': 'Organization', name },
    },
  };
  return `<script type="application/ld+json">\n${JSON.stringify(org, null, 2)}\n</script>\n\n<script type="application/ld+json">\n${JSON.stringify(product, null, 2)}\n</script>\n`;
}

export function buildFixPlan(record) {
  const open = gaps(record);
  const evidenceFor = (id) => (record.checks.find((c) => c.id === id) || {}).evidence || {};
  const steps = [];
  for (const g of open) {
    switch (g.id) {
      case 'robots-ai': {
        const blocked = (evidenceFor('robots-ai').agents || []).filter((a) => !a.allowed).map((a) => a.agent);
        steps.push({
          check: g.label,
          delta: g.max - g.earned,
          action: blocked.length
            ? `Unblock ${blocked.join(', ')} in robots.txt for the storefront paths. Copy robots-additions.txt above the existing rules.`
            : 'Allow retrieval agents in robots.txt. Copy robots-additions.txt above the existing rules.',
        });
        break;
      }
      case 'llms-txt':
        steps.push({
          check: g.label,
          delta: g.max - g.earned,
          action: 'Publish the generated llms.txt at the site root with real policy and support URLs.',
        });
        break;
      case 'home-schema':
        steps.push({
          check: g.label,
          delta: g.max - g.earned,
          action: 'Add Organization and WebSite JSON-LD to the home template. schema-block.html is the base.',
        });
        break;
      case 'product-schema': {
        const missing = evidenceFor('product-schema').missing || [];
        steps.push({
          check: g.label,
          delta: g.max - g.earned,
          action: missing.length
            ? `Add ${missing.join(', ')} to the Product JSON-LD emitted by the product template.`
            : 'Emit complete Product JSON-LD from the product template.',
        });
        break;
      }
      case 'catalog': {
        const ev = evidenceFor('catalog');
        let action = 'Expose a public product feed and include product URLs in sitemap.xml.';
        if (ev.productsJson && !ev.productSitemap) {
          action = 'Feed is live; publish a dedicated product sitemap so agents can enumerate every SKU.';
        } else if (!ev.productsJson && ev.sitemap) {
          action = 'Sitemap is live; add a public JSON product feed with price, availability, and variants.';
        }
        steps.push({ check: g.label, delta: g.max - g.earned, action });
        break;
      }
      case 'policies': {
        const found = new Set(evidenceFor('policies').found || []);
        const missing = ['shipping', 'returns', 'contact', 'privacy'].filter((x) => !found.has(x));
        steps.push({
          check: g.label,
          delta: g.max - g.earned,
          action: `Link ${missing.join(', ')} from server-rendered footer or nav markup.`,
        });
        break;
      }
      case 'server-rendered':
        steps.push({
          check: g.label,
          delta: g.max - g.earned,
          action: 'Server-render product copy and prices. Client-only hydration is invisible to most agents.',
        });
        break;
      default:
        steps.push({ check: g.label, delta: g.max - g.earned, action: 'Review manually.' });
    }
  }
  return steps;
}

export function renderFixpackHtml(record, pack) {
  const steps = buildFixPlan(record);
  const rows = steps
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.check)}</td><td class="num">+${s.delta}</td><td>${escapeHtml(s.action)}</td></tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(brandName(record))} — agent readiness fix pack</title>
<style>
:root{--bg:#0b0d10;--panel:#12161b;--line:#232a33;--ink:#e6e9ee;--muted:#8b97a6;--accent:#6ee7a8;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:56px 24px 96px}
h1{font-size:30px;letter-spacing:-.02em;margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 40px}
h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:44px 0 12px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.num{font-family:var(--mono);color:var(--accent)}
pre{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px;overflow-x:auto;font:13px/1.6 var(--mono);color:#c9d3df}
.badge{display:inline-block;font-family:var(--mono);font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.cta{display:inline-block;background:var(--accent);color:#06120c;font-weight:600;padding:11px 20px;border-radius:8px;text-decoration:none}
.fine{color:var(--muted);font-size:13px;margin:10px 0 0}
.buy{margin-top:44px;padding:22px;border:1px solid var(--line);border-radius:12px;background:var(--panel);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.buy p{margin:0;color:var(--muted)}
</style></head><body><div class="wrap">
<h1>${escapeHtml(brandName(record))}</h1>
<p class="sub">Agent-commerce fix pack for ${escapeHtml(record.domain)} &middot; score ${record.score}/100 &middot; grade ${record.grade} &middot; <span class="badge">+${steps.reduce((s, x) => s + x.delta, 0)} points available</span></p>
<p><a class="cta" href="${escapeHtml(purchaseTarget())}">Get the full pack &mdash; $${config.pricing.fixPack}</a></p>
<p class="fine">ZIP with the report, llms.txt, robots additions, and JSON-LD blocks. Emailed within minutes of payment.</p>
<h2>Do this, in order</h2>
<table><thead><tr><th>Check</th><th>Gain</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
<h2>llms.txt &rarr; site root</h2><pre>${escapeHtml(pack.llmsTxt)}</pre>
<h2>robots.txt additions</h2><pre>${escapeHtml(pack.robots)}</pre>
<h2>JSON-LD blocks</h2><pre>${escapeHtml(pack.schema)}</pre>
<div class="buy"><p>Ship every step above in one afternoon.</p><a class="cta" href="${escapeHtml(purchaseTarget())}">Get the fix pack &mdash; $${config.pricing.fixPack}</a></div>
</div></body></html>`;
}
