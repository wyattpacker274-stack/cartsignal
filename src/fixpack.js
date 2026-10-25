import { gaps } from './checks.js';
import { escapeHtml, slug } from './html.js';
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
  const gain = steps.reduce((sum, step) => sum + step.delta, 0);
  const storeSlug = slug(record.domain);
  const rows = steps
    .map(
      (s, index) =>
        `<tr><td class="rank">${String(index + 1).padStart(2, '0')}</td><td>${escapeHtml(s.check)}</td><td class="num">+${s.delta}</td><td>${escapeHtml(s.action)}</td></tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(brandName(record))} — agent readiness fix pack</title>
<meta name="description" content="A prioritized agent-commerce fix plan and implementation files for ${escapeHtml(record.domain)}.">
<style>
:root{--bg:#0a0c0f;--panel:#111519;--panel2:#151a20;--line:#222a33;--ink:#e7eaef;--muted:#8a96a6;--dim:#5d6875;--accent:#6ee7a8;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
html{background:var(--bg);scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1120px;margin:0 auto;padding:0 28px}
header{border-bottom:1px solid var(--line);padding:18px 0;background:rgba(10,12,15,.9)}
header .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px}
.mark{display:flex;align-items:center;gap:10px;font-weight:600;letter-spacing:-.01em}
.dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 14px rgba(110,231,168,.7)}
nav{display:flex;gap:22px;font-size:13px;color:var(--muted)}
nav a:hover{color:var(--ink)}
.hero{padding:62px 0 48px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:64px;align-items:center}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:0 0 18px}
h1{font-size:clamp(34px,5vw,50px);line-height:1.08;letter-spacing:-.035em;margin:0 0 16px;font-weight:600}
.sub{color:var(--muted);font-size:16px;max-width:58ch;margin:0 0 22px}
.meta{display:flex;gap:8px;flex-wrap:wrap}
.badge{display:inline-block;font-family:var(--mono);font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.badge.gain{color:var(--accent);border-color:#245c42;background:#0f1c16}
.buy{background:linear-gradient(145deg,var(--panel2),var(--panel));border:1px solid #2b3540;border-radius:16px;padding:26px;box-shadow:0 24px 60px rgba(0,0,0,.2)}
.buy .label{font-size:12px;color:var(--muted);margin:0}
.price{font-family:var(--mono);font-size:34px;letter-spacing:-.04em;margin:3px 0 14px}
.price small{font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--dim);letter-spacing:0}
.cta{display:block;text-align:center;background:var(--accent);color:#06120c;font-weight:650;font-size:14px;padding:12px 18px;border-radius:8px}
.cta:hover{filter:brightness(1.08)}
.fine{color:var(--dim);font-size:12px;margin:12px 0 0;text-align:center}
section{padding:42px 0 0}
h2{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 18px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:15px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--dim);font-weight:500;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
td.rank{font-family:var(--mono);font-size:12px;color:var(--dim);width:44px}
.num{font-family:var(--mono);color:var(--accent);white-space:nowrap}
.file{border:1px solid var(--line);border-radius:12px;background:var(--panel);margin-bottom:12px;overflow:hidden}
summary{cursor:pointer;padding:17px 20px;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px}
summary::-webkit-details-marker{display:none}
summary:hover{background:var(--panel2)}
summary b{font-size:14px;font-weight:500}
summary span{font-family:var(--mono);font-size:11px;color:var(--dim)}
summary:after{content:'+';font-family:var(--mono);font-size:18px;color:var(--muted)}
details[open] summary:after{content:'−'}
pre{margin:0;border-top:1px solid var(--line);padding:20px;overflow-x:auto;font:12.5px/1.65 var(--mono);color:#c9d3df;max-height:540px;overflow-y:auto}
.closing{margin:48px 0 80px;padding:24px 26px;border:1px solid var(--line);border-radius:14px;background:var(--panel);display:flex;align-items:center;justify-content:space-between;gap:24px}
.closing p{margin:0;color:var(--muted);font-size:14px}
.closing b{display:block;color:var(--ink);font-size:16px;font-weight:500;margin-bottom:3px}
.closing .cta{white-space:nowrap}
.footer{border-top:1px solid var(--line);padding:28px 0 50px;color:var(--dim);font-size:12px}
@media(max-width:820px){.hero{grid-template-columns:1fr;gap:32px}.buy{max-width:480px}.closing{align-items:flex-start;flex-direction:column}.closing .cta{display:inline-block}}
@media(max-width:560px){.wrap{padding:0 18px}.hero{padding-top:42px}nav a:first-child{display:none}th:nth-child(3),td:nth-child(3){display:none}th,td{padding:13px 7px}summary{padding:15px}.closing{padding:22px}}
</style></head><body>
<header><div class="wrap"><a class="mark" href="../../index.html"><span class="dot"></span>CartSignal</a><nav><a href="../../index.html">Index</a><a href="../${storeSlug}.html">Full audit</a></nav></div></header>
<div class="wrap">
<div class="hero">
<div>
<p class="eyebrow">Agent readiness fix pack</p>
<h1>${escapeHtml(brandName(record))}</h1>
<p class="sub">A prioritized implementation plan for <strong>${escapeHtml(record.domain)}</strong>, based on its latest public audit. Start with the highest-impact gap and work down.</p>
<div class="meta"><span class="badge">Score ${record.score == null ? 'N/A' : record.score + '/100'}</span><span class="badge">Grade ${escapeHtml(record.grade)}</span><span class="badge gain">+${gain} points available</span></div>
</div>
<aside class="buy">
<p class="label">Implementation-ready pack</p>
<div class="price">$${config.pricing.fixPack} <small>one-time</small></div>
<a class="cta" href="${escapeHtml(purchaseTarget())}">Get this store's fix pack &rarr;</a>
<p class="fine">ZIP + formatted report, delivered by email.<br>Enter ${escapeHtml(record.domain)} at checkout.</p>
</aside>
</div>
<section id="plan">
<h2>The shortest path to +${gain} points</h2>
<div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Check</th><th>Gain</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>
</section>
<section>
<h2>Implementation files &middot; included in the pack</h2>
<details class="file"><summary><b>llms.txt</b><span>Publish at the site root</span></summary><pre>${escapeHtml(pack.llmsTxt)}</pre></details>
<details class="file"><summary><b>robots-additions.txt</b><span>Merge with the existing robots.txt</span></summary><pre>${escapeHtml(pack.robots)}</pre></details>
<details class="file"><summary><b>schema.html</b><span>Adapt to the store's templates</span></summary><pre>${escapeHtml(pack.schema)}</pre></details>
</section>
<div class="closing"><p><b>Everything needed to start the fix.</b>The ordered plan, editable files, and readable report in one ZIP.</p><a class="cta" href="${escapeHtml(purchaseTarget())}">Get the fix pack &mdash; $${config.pricing.fixPack}</a></div>
<div class="footer">CartSignal &middot; ${escapeHtml(record.domain)} &middot; automated agent-commerce audit</div>
</div></body></html>`;
}
