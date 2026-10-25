import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { scanDomain } from './checks.js';
import { renderLeaderboard, renderSite } from './report.js';
import { buildLlmsTxt, buildRobotsAdditions, buildSchemaBlock, buildFixPlan, renderFixpackHtml } from './fixpack.js';
import { escapeHtml, slug } from './html.js';
import { config } from './config.js';
import { saveSnapshot, loadPrevious, loadSnapshots, diffRecords } from './state.js';
import { sendMail } from './lib/mail.js';
import { buildZip } from './lib/zip.js';
import { writeOutreach } from './outreach.js';
import { digestSubject, digestText, digestHtml } from './digest.js';

const OUT = config.out;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const [key, inline] = token.slice(2).split('=');
      if (inline !== undefined) args[key] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
      else args[key] = true;
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadSites(file) {
  const text = await readFile(file, 'utf8');
  const seen = new Set();
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const value = line.replace(/#.*/, '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function packFiles(record) {
  return {
    llmsTxt: buildLlmsTxt(record),
    robots: buildRobotsAdditions(record),
    schema: buildSchemaBlock(record),
  };
}

async function writePack(record) {
  const dir = path.join(OUT, 'fixpacks', slug(record.domain));
  await mkdir(dir, { recursive: true });
  const pack = packFiles(record);
  await writeFile(path.join(dir, 'llms.txt'), pack.llmsTxt);
  await writeFile(path.join(dir, 'robots-additions.txt'), pack.robots);
  await writeFile(path.join(dir, 'schema.html'), pack.schema);
  await writeFile(
    path.join(dir, 'fix-plan.json'),
    JSON.stringify({ domain: record.domain, score: record.score, grade: record.grade, steps: buildFixPlan(record) }, null, 2),
  );
  return pack;
}

async function publish(records, generatedAt) {
  await mkdir(path.join(OUT, 'sites', 'fixpack'), { recursive: true });
  await writeFile(path.join(OUT, 'index.html'), renderLeaderboard(records, { generatedAt }));
  for (const record of records) {
    const s = slug(record.domain);
    await writeFile(path.join(OUT, 'sites', `${s}.html`), renderSite(record));
    const pack = await writePack(record);
    await writeFile(path.join(OUT, 'sites', 'fixpack', `${s}.html`), renderFixpackHtml(record, pack));
  }
}

async function cmdScan(args) {
  const file = path.resolve(config.root, args.file || config.scan.file || 'data/sites.txt');
  const limit = args.limit ? Number(args.limit) : Infinity;
  const concurrency = args.concurrency ? Number(args.concurrency) : config.scan.concurrency || 4;
  let sites = await loadSites(file);
  if (Number.isFinite(limit)) sites = sites.slice(0, limit);
  if (!sites.length) {
    console.error(`No sites in ${file}`);
    process.exit(1);
  }

  console.log(`scanning ${sites.length} stores, ${concurrency} at a time`);
  let done = 0;
  const records = await pool(sites, concurrency, async (site) => {
    const record = await scanDomain(site);
    done++;
    const label = String(done).padStart(String(sites.length).length, ' ');
    const note = record.score == null ? `-- ${record.status || record.error}` : `${record.grade} ${String(record.score).padStart(3, ' ')}`;
    console.log(`[${label}/${sites.length}] ${record.domain.padEnd(30, ' ')} ${note}`);
    return record;
  });

  const generatedAt = Date.now();
  const { stamp } = await saveSnapshot(records, OUT, new Date(generatedAt));
  const previous = await loadPrevious(OUT, stamp);
  const diff = diffRecords(previous, records);

  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'data.json'), JSON.stringify({ generatedAt: new Date(generatedAt).toISOString(), records }, null, 2));
  await writeFile(path.join(OUT, 'diff.json'), JSON.stringify(diff, null, 2));

  await publish(records, generatedAt);
  const queue = await writeOutreach(records, OUT);

  const ok = records.filter((r) => r.score != null);
  const mean = ok.length ? Math.round(ok.reduce((s, r) => s + r.score, 0) / ok.length) : 0;
  console.log(`\n${ok.length}/${records.length} reachable · mean ${mean} · ${diff.changes.length} changed vs ${diff.previousStamp || 'first run'}`);
  console.log(`leaderboard  ${path.join(OUT, 'index.html')}`);
  console.log(`dataset      ${path.join(OUT, 'data.json')}`);
  console.log(`fix packs    ${path.join(OUT, 'fixpacks')}`);
  console.log(`outreach     ${queue.length} drafts in ${path.join(OUT, 'outreach')}`);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function cmdDigest(args) {
  const dataPath = path.join(OUT, 'data.json');
  if (!existsSync(dataPath)) {
    console.error('No scan yet. Run: node src/cli.js scan');
    process.exit(1);
  }
  const data = await readJson(dataPath);
  const diffPath = path.join(OUT, 'diff.json');
  const diff = existsSync(diffPath) ? await readJson(diffPath) : null;
  const records = data.records || [];

  const subject = digestSubject(records, diff);
  const text = digestText(records, diff);
  const html = digestHtml(records, diff);

  await writeFile(path.join(OUT, 'digest.html'), html);
  await writeFile(path.join(OUT, 'digest.txt'), text);

  const to = args.to || config.ownerEmail;
  if (!args.send) {
    console.log(subject);
    console.log('');
    console.log(text);
    console.log('\n(dry run — pass --send to email it)');
    return;
  }
  const result = await sendMail({ to, subject, html, text });
  console.log(result.sent ? `digest sent to ${to} (${result.id})` : `digest not sent: ${result.reason}`);
}

async function buildDelivery(record) {
  await writePack(record);
  const pack = packFiles(record);
  const reportHtml = renderFixpackHtml(record, pack);
  const plan = JSON.stringify({ domain: record.domain, score: record.score, grade: record.grade, steps: buildFixPlan(record) }, null, 2);
  const zip = buildZip([
    { name: `${slug(record.domain)}/llms.txt`, data: pack.llmsTxt },
    { name: `${slug(record.domain)}/robots-additions.txt`, data: pack.robots },
    { name: `${slug(record.domain)}/schema.html`, data: pack.schema },
    { name: `${slug(record.domain)}/fix-plan.json`, data: plan },
    { name: `${slug(record.domain)}/report.html`, data: reportHtml },
  ]);
  const dir = path.join(OUT, 'deliveries');
  await mkdir(dir, { recursive: true });
  const filename = `${slug(record.domain)}-agent-readiness-pack.zip`;
  await writeFile(path.join(dir, filename), zip);
  return { zip, filename, reportHtml, plan };
}

function orderHash(order) {
  return createHash('sha256').update(String(order)).digest('hex');
}

async function readFulfillments() {
  const file = path.join(OUT, 'fulfillments.json');
  if (!existsSync(file)) return [];
  const data = await readJson(file);
  return Array.isArray(data.orders) ? data.orders : [];
}

async function recordFulfillment(order) {
  const orders = await readFulfillments();
  const hash = orderHash(order);
  if (orders.some((entry) => entry.hash === hash)) return;
  orders.push({ hash, sentAt: new Date().toISOString() });
  await writeFile(path.join(OUT, 'fulfillments.json'), JSON.stringify({ orders }, null, 2) + '\n');
}

async function alertFulfillmentFailure(domain, email, error) {
  if (!config.ownerEmail) {
    console.error('owner alert not sent: CARTSIGNAL_OWNER_EMAIL is unset');
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const result = await sendMail({
    to: config.ownerEmail,
    subject: `CartSignal fulfillment failed: ${domain}`,
    text: `A paid fix pack could not be delivered.\n\nDomain: ${domain}\nBuyer: ${email}\nError: ${message}\n\nCheck the GitHub Actions run, then retry fulfillment.`,
    html: `<p>A paid fix pack could not be delivered.</p><dl><dt>Domain</dt><dd>${escapeHtml(domain)}</dd><dt>Buyer</dt><dd>${escapeHtml(email)}</dd><dt>Error</dt><dd>${escapeHtml(message)}</dd></dl><p>Check the GitHub Actions run, then retry fulfillment.</p>`,
  });
  console.error(result.sent ? `owner alert sent (${result.id})` : `owner alert failed: ${result.reason}`);
}

async function cmdFulfill(args) {
  const domain = String(args.domain || '').trim().toLowerCase().replace(/^www\./, '');
  const email = String(args.email || '').trim();
  if (!DOMAIN_RE.test(domain)) {
    console.error(`invalid domain: ${domain}`);
    process.exit(2);
  }
  if (!EMAIL_RE.test(email)) {
    console.error(`invalid email: ${email}`);
    process.exit(2);
  }

  const order = String(args.order || '').trim();
  try {
    if (order && (await readFulfillments()).some((entry) => entry.hash === orderHash(order))) {
      console.log('order already fulfilled; duplicate delivery skipped');
      return;
    }

    let record = null;
    const dataPath = path.join(OUT, 'data.json');
    if (existsSync(dataPath)) {
      const data = await readJson(dataPath);
      record = (data.records || []).find((r) => r.domain === domain) || null;
    }
    if (!record) record = await scanDomain(domain);

    const delivery = await buildDelivery(record);
    const subject = `${record.domain} — agent readiness fix pack (${record.score == null ? 'n/a' : record.score + '/100'})`;
    const text = [
      `Thanks — here is the agent readiness pack for ${record.domain}.`,
      '',
      `Score at build time: ${record.score == null ? 'not scored' : `${record.score}/100 (${record.grade})`}.`,
      '',
      'In the zip:',
      '  llms.txt                — publish at the site root',
      '  robots-additions.txt    — merge above existing robots rules',
      '  schema.html             — Organization + Product JSON-LD blocks',
      '  fix-plan.json           — ordered actions with the points each is worth',
      '  report.html             — the same plan, readable in a browser',
      '',
      'Apply in the order listed. Re-scan is free any time.',
      '',
      config.brand,
      config.baseUrl,
    ].join('\n');

    const html = `<div style="font:15px/1.65 -apple-system,Segoe UI,sans-serif;color:#10161c;max-width:600px">
<p>Thanks — here is the agent readiness pack for <strong>${escapeHtml(record.domain)}</strong>.</p>
<p>Score at build time: <strong>${record.score == null ? 'not scored' : `${record.score}/100 (${escapeHtml(record.grade)})`}</strong>.</p>
<p>Attached: <code>${escapeHtml(delivery.filename)}</code></p>
<ul style="padding-left:18px">
<li><strong>llms.txt</strong> — publish at the site root</li>
<li><strong>robots-additions.txt</strong> — merge above existing robots rules</li>
<li><strong>schema.html</strong> — Organization and Product JSON-LD blocks</li>
<li><strong>fix-plan.json</strong> — ordered actions, each with the points it is worth</li>
<li><strong>report.html</strong> — the same plan, readable in a browser</li>
</ul>
<p>Apply in the order listed. Re-scan is free any time.</p>
<p style="color:#6b7785">${escapeHtml(config.brand)} · ${escapeHtml(config.baseUrl)}</p>
</div>`;

    const result = await sendMail({
      to: email,
      subject,
      html,
      text,
      attachments: [{ filename: delivery.filename, content: delivery.zip }],
    });
    if (!result.sent) throw new Error(`${result.reason}; zip ready at out/deliveries/${delivery.filename}`);

    console.log(`delivered ${delivery.filename} to ${email} (${result.id})`);
    if (order) await recordFulfillment(order);
  } catch (error) {
    console.error(`fulfillment failed for ${domain}: ${error instanceof Error ? error.message : error}`);
    await alertFulfillmentFailure(domain, email, error);
    process.exitCode = 1;
  }
}

async function cmdFixpack(args) {
  const target = String(args._[1] || args.domain || '').toLowerCase().replace(/^www\./, '');
  if (!target) {
    console.error('usage: node src/cli.js fixpack <domain>');
    process.exit(1);
  }
  let record;
  const dataPath = path.join(OUT, 'data.json');
  if (existsSync(dataPath)) {
    const data = await readJson(dataPath);
    record = (data.records || []).find((r) => r.domain === target);
  }
  if (!record) record = await scanDomain(target);
  const pack = await writePack(record);
  await mkdir(path.join(OUT, 'sites', 'fixpack'), { recursive: true });
  await writeFile(path.join(OUT, 'sites', 'fixpack', `${slug(record.domain)}.html`), renderFixpackHtml(record, pack));
  console.log(`fix pack written for ${record.domain} (score ${record.score}, grade ${record.grade})`);
}

async function cmdOutreach(args) {
  const dataPath = path.join(OUT, 'data.json');
  if (!existsSync(dataPath)) {
    console.error('No scan yet.');
    process.exit(1);
  }
  const data = await readJson(dataPath);
  const queue = await writeOutreach(data.records || [], OUT);
  console.log(`${queue.length} drafts written to out/outreach`);
  for (const item of queue.slice(0, 5)) {
    console.log(`  ${item.domain.padEnd(24)} ${String(item.score).padStart(3)}  ${item.contactUrl || 'no contact link'}`);
  }
}

async function cmdPublish() {
  const dataPath = path.join(OUT, 'data.json');
  if (!existsSync(dataPath)) {
    console.error('No scan yet.');
    process.exit(1);
  }
  const data = await readJson(dataPath);
  const records = data.records || [];
  await publish(records, Date.parse(data.generatedAt) || Date.now());
  console.log(`republished ${records.length} records to out/ (no rescan)`);
}

async function cmdHistory() {
  const snapshots = await loadSnapshots(OUT);
  if (!snapshots.length) {
    console.log('no snapshots yet');
    return;
  }
  for (const snap of snapshots) {
    const scored = (snap.records || []).filter((r) => r.score != null);
    const mean = scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : 0;
    console.log(`${snap.stamp}  ${String(scored.length).padStart(3)} scored  mean ${String(mean).padStart(3)}`);
  }
}

async function cmdDoctor() {
  const checks = [];
  const add = (ok, label, fix) => checks.push({ ok, label, fix });

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add(nodeMajor >= 20, `Node ${process.versions.node}`, 'Install Node 20 or newer.');

  const localUrl = /localhost|127\.0\.0\.1/.test(config.baseUrl);
  add(!localUrl, `Base URL: ${config.baseUrl}`, 'Set CARTSIGNAL_BASE_URL to your deployed Pages URL.');

  add(Boolean(config.ownerEmail), `Owner email: ${config.ownerEmail || 'unset'}`, 'Set CARTSIGNAL_OWNER_EMAIL to where the digest goes.');

  const key = process.env.RESEND_API_KEY;
  add(Boolean(key && key.startsWith('re_')), `Resend key: ${key ? 'present' : 'unset'}`, 'Set RESEND_API_KEY (local: node --env-file=.env ...).');

  add(Boolean(config.checkoutUrl), `Checkout URL: ${config.checkoutUrl || 'unset'}`, 'Set checkoutUrl in config.json to your Stripe payment link.');

  add(
    existsSync(path.join(config.root, '.github/workflows/scan.yml')),
    'Scan workflow',
    'Restore .github/workflows/scan.yml.',
  );
  add(
    existsSync(path.join(config.root, 'worker/stripe-fulfill.js')),
    'Fulfillment worker',
    'Restore worker/stripe-fulfill.js.',
  );

  const siteFile = path.resolve(config.root, config.scan.file || 'data/sites.txt');
  const sites = existsSync(siteFile) ? await loadSites(siteFile) : [];
  add(sites.length >= 20, `Store list: ${sites.length} domains`, 'Add storefronts to data/sites.txt.');

  add(existsSync(path.join(OUT, 'data.json')), 'Last scan on disk', 'Run: node src/cli.js scan');

  const envFile = path.join(config.root, '.env');
  add(existsSync(envFile), '.env file', 'Copy .env.example to .env and fill it in.');
  if (existsSync(envFile) && !process.env.RESEND_API_KEY) {
    checks.push({ ok: false, label: '.env not loaded', fix: 'Run with: node --env-file=.env src/cli.js <command>' });
  }

  const width = Math.max(...checks.map((c) => c.label.length));
  for (const check of checks) {
    console.log(`${check.ok ? 'OK      ' : 'MISSING '} ${check.label.padEnd(width)}  ${check.ok ? '' : '-> ' + check.fix}`);
  }
  const failing = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failing}/${checks.length} ready${failing ? ` — ${failing} to fix` : ''}`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
};

async function cmdServe(args) {
  const port = Number(args.port || 4173);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const target = path.resolve(OUT, '.' + rel);
    if (!target.startsWith(OUT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    try {
      const body = await readFile(target);
      res.writeHead(200, { 'content-type': TYPES[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  server.listen(port, () => {
    console.log(`CartSignal index  http://localhost:${port}`);
    console.log(`fix packs        http://localhost:${port}/sites/fixpack/`);
  });
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs([command, ...rest].filter(Boolean));

switch (command) {
  case 'scan':
    await cmdScan(args);
    break;
  case 'digest':
    await cmdDigest(args);
    break;
  case 'fulfill':
    await cmdFulfill(args);
    break;
  case 'fixpack':
    await cmdFixpack(args);
    break;
  case 'outreach':
    await cmdOutreach(args);
    break;
  case 'publish':
    await cmdPublish();
    break;
  case 'doctor':
    await cmdDoctor();
    break;
  case 'history':
    await cmdHistory();
    break;
  case 'list':
    for (const entry of existsSync(path.join(OUT, 'fixpacks')) ? await readdir(path.join(OUT, 'fixpacks')) : []) console.log(entry);
    break;
  case 'serve':
    await cmdServe(args);
    break;
  default:
    console.log(`CartSignal CLI

  node src/cli.js scan [--file data/sites.txt] [--limit 20] [--concurrency 4]
  node src/cli.js digest [--send] [--to you@domain.com]
  node src/cli.js fixpack <domain>
  node src/cli.js fulfill --domain <domain> --email <buyer@email>
  node src/cli.js outreach
  node src/cli.js publish
  node src/cli.js doctor
  node src/cli.js history
  node src/cli.js serve [--port 4173]
`);
}
