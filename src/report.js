import { escapeHtml, slug } from './html.js';
import { gaps } from './checks.js';
import { buildFixPlan } from './fixpack.js';
import { config } from './config.js';

const CSS = `
:root{--bg:#0a0c0f;--panel:#111519;--panel2:#151a20;--line:#222a33;--ink:#e7eaef;--muted:#8a96a6;--dim:#5d6875;--accent:#6ee7a8;--warn:#f2b544;--bad:#ff7b72;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1120px;margin:0 auto;padding:0 28px}
header.top{border-bottom:1px solid var(--line);padding:18px 0;position:sticky;top:0;background:rgba(10,12,15,.86);backdrop-filter:blur(10px);z-index:10}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px}
.mark{display:flex;align-items:center;gap:10px;font-weight:600;letter-spacing:-.01em}
.mark span.dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 14px rgba(110,231,168,.7)}
.top nav{display:flex;gap:22px;font-size:13px;color:var(--muted)}
.top nav a:hover{color:var(--ink)}
.hero{padding:64px 0 40px;border-bottom:1px solid var(--line)}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin:0 0 18px}
h1{font-size:clamp(32px,5vw,54px);line-height:1.06;letter-spacing:-.035em;margin:0 0 18px;font-weight:600;max-width:15ch}
.lede{color:var(--muted);font-size:17px;max-width:62ch;margin:0 0 28px}
.stats{display:flex;flex-wrap:wrap;gap:34px;margin-top:34px}
.stat b{display:block;font-family:var(--mono);font-size:26px;font-weight:500;letter-spacing:-.02em}
.stat span{font-size:12px;color:var(--dim);letter-spacing:.04em;text-transform:uppercase}
section{padding:44px 0}
h2{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:0 0 18px}
table.grid{width:100%;border-collapse:collapse;font-size:14px}
.grid th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:500;padding:0 12px 12px;border-bottom:1px solid var(--line)}
.grid td{padding:13px 12px;border-bottom:1px solid #191e24;vertical-align:middle}
.grid tr:hover td{background:#0e1216}
.grid td.rank{font-family:var(--mono);color:var(--dim);width:52px}
.grid td.dom{font-weight:500}
.grid td.dom small{display:block;color:var(--dim);font-weight:400;font-size:12px;margin-top:2px}
.bar{height:5px;background:#1b222a;border-radius:99px;overflow:hidden;min-width:110px}
.bar i{display:block;height:100%;border-radius:99px}
.scorecell{display:flex;align-items:center;gap:12px;min-width:190px}
.scorecell b{font-family:var(--mono);font-weight:500;width:34px;text-align:right}
.grade{font-family:var(--mono);font-size:12px;padding:2px 8px;border-radius:5px;border:1px solid}
.gA{color:#6ee7a8;border-color:#245c42;background:#0f1c16}
.gB{color:#9ad8ff;border-color:#24485c;background:#0d171d}
.gC{color:#f2b544;border-color:#5c4524;background:#1d170d}
.gD{color:#ff9e64;border-color:#5c3824;background:#1d120d}
.gF{color:#ff7b72;border-color:#5c2424;background:#1d0d0d}
.gN{color:#8a96a6;border-color:#2b343f;background:#12161b}
.gap{color:var(--muted);font-size:13px}
.footer{border-top:1px solid var(--line);padding:40px 0 70px;color:var(--dim);font-size:13px}
.footer a{color:var(--muted);border-bottom:1px solid #2b343f}
.detail{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:44px;padding:56px 0 80px;align-items:start}
@media(max-width:820px){.detail{grid-template-columns:1fr}}
.ring{position:relative;width:190px;height:190px;margin:0 auto 26px}
.ring svg{transform:rotate(-90deg)}
.ring .num{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.ring .num b{font-family:var(--mono);font-size:44px;font-weight:500;letter-spacing:-.03em;display:block;line-height:1}
.ring .num span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.side{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:26px;position:sticky;top:96px}
.side dl{margin:0;display:grid;grid-template-columns:1fr auto;gap:10px 12px;font-size:13px}
.side dt{color:var(--dim)}
.side dd{margin:0;text-align:right;font-family:var(--mono);font-size:12px}
.side hr{border:0;border-top:1px solid var(--line);margin:20px 0}
.cta{display:block;text-align:center;background:var(--accent);color:#062015;font-weight:600;font-size:13px;padding:11px 14px;border-radius:8px;margin-top:18px}
.cta:hover{filter:brightness(1.08)}
.check{border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:12px;background:var(--panel)}
.check .row{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:10px}
.check h3{margin:0;font-size:15px;font-weight:500;letter-spacing:-.01em}
.check .pts{font-family:var(--mono);font-size:12px;color:var(--dim);white-space:nowrap}
.check .pts b{color:var(--ink);font-weight:500;font-size:14px}
.check p{margin:8px 0 0;color:var(--muted);font-size:13.5px}
.mono{font-family:var(--mono);font-size:12px;color:var(--dim);margin-top:10px;white-space:pre-wrap;word-break:break-word}
.checks-list{display:grid;gap:0}
.pill{display:inline-block;font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.back{font-size:13px;color:var(--muted)}
.back:hover{color:var(--ink)}
.method{max-width:70ch;color:var(--muted);font-size:14px}
.method li{margin-bottom:8px}
`;

function colorFor(score) {  if (score >= 70) return 'var(--accent)';
  if (score >= 55) return 'var(--warn)';
  return 'var(--bad)';
}

function gradeClass(g) {
  return g === 'N/A' ? 'gN' : `g${g}`;
}

function sitePath(record) {
  return `sites/${slug(record.domain)}.html`;
}

function checkoutTarget() {
  if (config.checkoutUrl) return config.checkoutUrl;
  if (config.ownerEmail) return `mailto:${config.ownerEmail}?subject=${encodeURIComponent('Agent readiness fix pack')}`;
  return '#method';
}

export function renderLeaderboard(records, opts = {}) {
  const sorted = [...records].sort((a, b) => {
    const as = a.score == null ? -1 : a.score;
    const bs = b.score == null ? -1 : b.score;
    return bs - as || a.domain.localeCompare(b.domain);
  });
  const ok = sorted.filter((r) => r.ok);
  const avg = ok.length ? Math.round(ok.reduce((s, r) => s + r.score, 0) / ok.length) : 0;
  const withLlms = ok.filter((r) => {
    const c = r.checks.find((x) => x.id === 'llms-txt');
    return c && c.earned === c.max;
  }).length;
  const blocking = records.filter((r) => {
    const c = r.checks.find((x) => x.id === 'robots-ai');
    return r.blocked === true || (c && c.earned < c.max);
  }).length;
  const catalogReady = ok.filter((r) => {
    const c = r.checks.find((x) => x.id === 'catalog');
    return c && c.earned >= 8;
  }).length;

  const pct = (n) => (ok.length ? Math.round((n / ok.length) * 100) : 0);
  const pctAll = (n) => (records.length ? Math.round((n / records.length) * 100) : 0);

  const rows = sorted
    .map((r, i) => {
      const top = gaps(r)[0];
      const scored = r.score != null;
      const scoreCell = scored
        ? `<div class="scorecell"><div class="bar"><i style="width:${r.score}%;background:${colorFor(r.score)}"></i></div><b>${r.score}</b><span class="grade ${gradeClass(r.grade)}">${r.grade}</span></div>`
        : `<div class="scorecell"><span class="grade gN">N/A</span><span class="gap">${r.blocked ? 'blocked' : 'unreachable'}</span></div>`;
      const gapCell = scored
        ? top
          ? escapeHtml(top.label) + ` <span style="color:var(--dim)">−${top.max - top.earned}</span>`
          : '<span style="color:var(--dim)">clean</span>'
        : `<span style="color:var(--dim)">${escapeHtml(r.error || 'HTTP ' + r.status)}</span>`;
      return `<tr>
<td class="rank">${String(i + 1).padStart(2, '0')}</td>
<td class="dom"><a href="${sitePath(r)}">${escapeHtml(r.domain)}</a><small>${escapeHtml(r.platform)}</small></td>
<td>${scoreCell}</td>
<td class="gap">${gapCell}</td>
</tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CartSignal — agent-commerce readiness index</title>
<meta name="description" content="How ready are storefronts for autonomous shopping agents? Public index scored on crawler access, llms.txt, product schema, catalog feeds, and server rendering.">
<style>${CSS}</style></head>
<body>
<header class="top"><div class="wrap">
<div class="mark"><span class="dot"></span>CartSignal</div>
<nav><a href="#index">Index</a><a href="#method">Method</a><a href="${escapeHtml(checkoutTarget())}">Get a fix pack</a></nav>
</div></header>

<div class="wrap">
<div class="hero">
<p class="eyebrow">Agent-commerce readiness index</p>
<h1>The web is being shopped by machines nobody audited for.</h1>
<p class="lede">Search engines got twenty years of optimization. Shopping agents got none. CartSignal scores storefronts on the things an autonomous buyer actually needs: crawler access, <code>llms.txt</code>, product structured data, public catalog feeds, legible policies, and server-rendered content.</p>
<p style="margin:26px 0 0"><a class="cta" style="display:inline-block;padding:12px 22px" href="${escapeHtml(checkoutTarget())}">Get the fix pack &mdash; $${escapeHtml(config.pricing.fixPack)}</a></p>
<div class="stats">
<div class="stat"><b>${ok.length}</b><span>stores scanned</span></div>
<div class="stat"><b>${avg}</b><span>mean score</span></div>
<div class="stat"><b>${pct(withLlms)}%</b><span>publish llms.txt</span></div>
<div class="stat"><b>${pct(catalogReady)}%</b><span>expose a catalog</span></div>
<div class="stat"><b>${pctAll(blocking)}%</b><span>block an AI agent</span></div>
</div>
</div>

<section id="index">
<h2>Index &middot; ${new Date(opts.generatedAt || Date.now()).toISOString().slice(0, 10)}</h2>
<div style="overflow-x:auto"><table class="grid">
<thead><tr><th>#</th><th>Storefront</th><th>Readiness</th><th>Largest gap</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
</section>

<section id="method">
<h2>Method</h2>
<div class="method">
<p>Every score comes from public, unauthenticated requests. No account, no API key, no crawl beyond the homepage, one product page, and the standard policy endpoints.</p>
<ul>
<li><b>AI crawler access — 20.</b> A parsed robots.txt check for GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, and Applebot-Extended.</li>
<li><b>llms.txt — 10.</b> Whether a structured <code>/llms.txt</code> exists and leads with a top-level heading.</li>
<li><b>Entity markup — 15.</b> Organization, WebSite, and navigation JSON-LD on the home page.</li>
<li><b>Product markup — 20.</b> Product JSON-LD on one product page: name, price, currency, availability, image, and an identifier.</li>
<li><b>Catalog feed — 15.</b> A public product feed plus a sitemap, plus a product sitemap where one exists.</li>
<li><b>Policies — 10.</b> Shipping, returns, contact, and privacy links present in server-rendered markup.</li>
<li><b>Server rendering — 10.</b> Visible character count in the raw HTML response.</li>
</ul>
<p style="color:var(--dim);font-size:13px">Scores are a snapshot. A store can move twenty points in an afternoon with the right file and a template change.</p>
</div>
</section>

<div class="footer">
CartSignal &middot; automated agent-commerce audits &middot; <a href="mailto:hello@cartsignal.dev">hello@cartsignal.dev</a>
</div>
</div>
</body></html>`;
}

export function renderSite(record) {
  const sorted = [...record.checks].sort((a, b) => b.max - a.max);
  const ring = 2 * Math.PI * 34;
  const scored = record.score != null;
  const dash = ((record.score || 0) / 100) * ring;
  const plan = buildFixPlan(record);
  const gain = plan.reduce((s, x) => s + x.delta, 0);
  const scoreLabel = scored ? String(record.score) : 'N/A';
  const llmsCheck = record.checks.find((c) => c.id === 'llms-txt');
  const agentRails = Boolean(llmsCheck && llmsCheck.evidence && llmsCheck.evidence.agentRails);
  const badges = [
    `<span class="pill">${escapeHtml(record.platform)}</span>`,
    agentRails
      ? '<span class="pill" style="color:var(--accent);border-color:#245c42">agent checkout rails detected</span>'
      : '<span class="pill">no agent checkout rails</span>',
  ].join(' ');

  const checksHtml = sorted
    .map((c) => {
      const pct = c.max ? Math.round((c.earned / c.max) * 100) : 0;
      const ev = c.evidence && Object.keys(c.evidence).length
        ? `<div class="mono">${escapeHtml(JSON.stringify(c.evidence, null, 2).slice(0, 700))}</div>`
        : '';
      return `<div class="check">
<div class="row"><h3>${escapeHtml(c.label)}</h3><div class="pts"><b>${c.earned}</b> / ${c.max}</div></div>
<div class="bar"><i style="width:${pct}%;background:${colorFor(pct)}"></i></div>
<p>${escapeHtml(c.note)}</p>
${ev}
</div>`;
    })
    .join('\n');

  const steps = plan.length
    ? plan
        .map(
          (s, i) =>
            `<tr><td class="rank">${String(i + 1).padStart(2, '0')}</td><td>${escapeHtml(s.check)}</td><td class="num" style="color:var(--accent);font-family:var(--mono)">+${s.delta}</td><td>${escapeHtml(s.action)}</td></tr>`,
        )
        .join('\n')
    : `<tr><td colspan="4" style="color:var(--muted)">No gaps. This storefront is agent-ready.</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(record.domain)} — agent readiness ${record.score}/100</title>
<style>${CSS}</style></head>
<body>
<header class="top"><div class="wrap">
<div class="mark"><a href="../index.html" style="display:flex;align-items:center;gap:10px"><span class="dot"></span>CartSignal</a></div>
<nav><a href="../index.html">Index</a><a href="../index.html#method">Method</a></nav>
</div></header>

<div class="wrap">
<div style="padding-top:34px"><a class="back" href="../index.html">&larr; all storefronts</a></div>
<div class="detail">
<main>
<h1 style="font-size:34px;max-width:none;margin-bottom:10px">${escapeHtml(record.domain)}</h1>
<p class="lede" style="margin-bottom:18px">${escapeHtml(record.meta && record.meta.title ? record.meta.title : record.platform)}</p>
<p style="margin-bottom:34px">${badges}</p>
<h2>Score breakdown</h2>
<div class="checks-list">
${checksHtml}
</div>
</main>
<aside class="side">
<div class="ring">
<svg width="190" height="190" viewBox="0 0 84 84">
<circle cx="42" cy="42" r="34" fill="none" stroke="#1b222a" stroke-width="6"/>
<circle cx="42" cy="42" r="34" fill="none" stroke="${colorFor(record.score || 0)}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${ring.toFixed(1)}"/>
</svg>
<div class="num"><b>${scoreLabel}</b><span>${scored ? 'of 100' : 'not scored'}</span></div>
</div>
<dl>
<dt>Grade</dt><dd><span class="grade ${gradeClass(record.grade)}">${escapeHtml(record.grade)}</span></dd>
<dt>Platform</dt><dd>${escapeHtml(record.platform)}</dd>
<dt>Status</dt><dd>${record.status}</dd>
<dt>Scanned</dt><dd>${escapeHtml(record.scannedAt.slice(0, 10))}</dd>
<dt>Available</dt><dd style="color:var(--accent)">${scored ? '+' + gain : '—'}</dd>
</dl>
<hr>
<a class="cta" href="fixpack/${slug(record.domain)}.html">Open fix pack &rarr;</a>
</aside>
</div>

<section>
<h2>Fix plan &middot; +${gain} points</h2>
<div style="overflow-x:auto"><table class="grid">
<thead><tr><th>#</th><th>Check</th><th>Gain</th><th>Action</th></tr></thead>
<tbody>${steps}</tbody>
</table></div>
</section>

<div class="footer">CartSignal &middot; ${escapeHtml(record.domain)} &middot; automated audit</div>
</div>
</body></html>`;
}
