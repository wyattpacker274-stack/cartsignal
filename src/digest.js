import { escapeHtml } from './html.js';
import { config, publicUrl } from './config.js';

function avg(records) {
  const scored = records.filter((r) => r.score != null);
  if (!scored.length) return 0;
  return Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length);
}

function line(change) {
  if (change.from == null && change.to != null) return `${change.domain}: N/A -> ${change.to}`;
  if (change.to == null) return `${change.domain}: ${change.from} -> blocked`;
  return `${change.domain}: ${change.from} -> ${change.to} (${change.delta > 0 ? '+' : ''}${change.delta})`;
}

export function digestSubject(records, diff) {
  const n = records.length;
  const scored = records.filter((r) => r.score != null).length;
  const movers = diff ? diff.changes.length : 0;
  return `${config.brand}: ${scored}/${n} scored, mean ${avg(records)}${movers ? `, ${movers} changed` : ''}`;
}

export function digestText(records, diff) {
  const scored = records.filter((r) => r.score != null);
  const blocked = records.filter((r) => r.blocked);
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const out = [];
  out.push(`${config.brand} scan — ${new Date().toISOString().slice(0, 10)}`);
  out.push(`${scored.length}/${records.length} reachable · mean ${avg(records)} · ${blocked.length} blocked`);
  out.push('');
  if (diff && diff.previousStamp) {
    out.push(`Compared with ${diff.previousStamp}`);
    if (diff.improved.length) out.push(`Gains: ${diff.improved.slice(0, 5).map(line).join(' | ')}`);
    if (diff.regressed.length) out.push(`Drops: ${diff.regressed.slice(0, 5).map(line).join(' | ')}`);
    if (diff.newlyBlocked.length) out.push(`Newly blocked: ${diff.newlyBlocked.map((c) => c.domain).join(', ')}`);
    if (diff.added.length) out.push(`Added: ${diff.added.slice(0, 8).join(', ')}`);
    if (!diff.changes.length && !diff.added.length) out.push('No score changes.');
  } else {
    out.push('First snapshot — no comparison yet.');
  }
  out.push('');
  out.push(`Top: ${sorted.slice(0, 3).map((r) => `${r.domain} ${r.score}`).join(', ')}`);
  out.push(`Bottom: ${sorted.slice(-3).reverse().map((r) => `${r.domain} ${r.score}`).join(', ')}`);
  out.push('');
  out.push(publicUrl(''));
  return out.join('\n');
}

export function digestHtml(records, diff) {
  const scored = records.filter((r) => r.score != null);
  const blocked = records.filter((r) => r.blocked);
  const sorted = [...scored].sort((a, b) => b.score - a.score);

  const row = (change) => {
    const tone = change.delta > 0 ? '#2f8f5b' : '#b3443c';
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eceff2">${escapeHtml(change.domain)}</td><td style="padding:6px 10px;border-bottom:1px solid #eceff2;color:#6b7785">${change.from == null ? 'N/A' : change.from}</td><td style="padding:6px 10px;border-bottom:1px solid #eceff2">${change.to == null ? 'blocked' : change.to}</td><td style="padding:6px 10px;border-bottom:1px solid #eceff2;color:${tone};font-variant-numeric:tabular-nums">${change.delta > 0 ? '+' : ''}${change.delta}</td></tr>`;
  };

  const section = (title, rows) =>
    rows.length
      ? `<h2 style="font:600 13px/1.4 -apple-system,Segoe UI,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6b7785;margin:30px 0 8px">${title}</h2><table style="width:100%;border-collapse:collapse;font:14px/1.5 -apple-system,Segoe UI,sans-serif"><tbody>${rows}</tbody></table>`
      : '';

  const top = sorted.slice(0, 5).map((r) => `${escapeHtml(r.domain)} <span style="color:#6b7785">${r.score}</span>`).join(' · ');

  return `<!doctype html><html><body style="margin:0;background:#f6f7f8;padding:28px">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e6e9ec;border-radius:12px;padding:30px 30px 36px;font:14px/1.6 -apple-system,Segoe UI,sans-serif;color:#10161c">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b7785">${escapeHtml(config.brand)} · weekly scan</p>
<h1 style="margin:0 0 6px;font-size:24px;letter-spacing:-.02em">${scored.length}/${records.length} reachable · mean ${avg(records)}</h1>
<p style="margin:0;color:#6b7785">${blocked.length} storefronts blocking automated access · ${new Date().toISOString().slice(0, 10)}</p>
${diff && diff.previousStamp ? `<p style="margin:16px 0 0;color:#6b7785">Compared with ${escapeHtml(diff.previousStamp)}</p>` : '<p style="margin:16px 0 0;color:#6b7785">First snapshot — no comparison yet.</p>'}
${diff ? section('Gains', diff.improved.slice(0, 8).map(row).join('')) : ''}
${diff ? section('Drops', diff.regressed.slice(0, 8).map(row).join('')) : ''}
${diff && diff.newlyBlocked.length ? `<p style="margin:24px 0 0;color:#b3443c"><strong>Newly blocked:</strong> ${diff.newlyBlocked.map((c) => escapeHtml(c.domain)).join(', ')}</p>` : ''}
<h2 style="font:600 13px/1.4 -apple-system,Segoe UI,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6b7785;margin:30px 0 8px">Leaders</h2>
<p style="margin:0">${top}</p>
<p style="margin:28px 0 0"><a href="${publicUrl('')}" style="display:inline-block;background:#10161c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open the index</a></p>
</div></body></html>`;
}
