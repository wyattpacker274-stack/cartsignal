import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config, publicUrl } from './config.js';
import { gaps } from './checks.js';
import { slug } from './html.js';

const FIX_LINE = {
  'robots-ai': 'a robots.txt block that turns retrieval agents away at the door',
  'llms-txt': 'a missing llms.txt, which is the file agents read first',
  'home-schema': 'no Organization or WebSite JSON-LD, so agents cannot resolve the brand',
  'product-schema': 'incomplete Product JSON-LD, so price and availability are unreadable',
  catalog: 'no public product feed, so agents cannot enumerate the catalog',
  policies: 'policy pages that are not linked in server-rendered markup',
  'server-rendered': 'client-only rendering, so the copy and prices never reach the agent',
};

export function buildOutreach(records) {
  const threshold = config.outreach.threshold || 60;
  const limit = config.outreach.limit || 30;
  const targets = records
    .filter((r) => r.score != null && r.score < threshold)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);

  return targets.map((record) => {
    const open = gaps(record);
    const top = open[0];
    const policies = record.checks.find((c) => c.id === 'policies');
    const contactUrl = (policies && policies.evidence && policies.evidence.urls && policies.evidence.urls.contact) || null;
    const publicPage = publicUrl(`sites/${slug(record.domain)}.html`);
    const fixLine = top ? FIX_LINE[top.id] || 'a structural gap' : 'a structural gap';
    const gapNote = top ? String(top.note).toLowerCase().replace(/\.+$/, '') : 'several checks failed';

    const subject = `${record.domain} scored ${record.score}/100 for AI shopping agents`;

    const body = [
      `Hi — quick note about ${record.domain}.`,
      '',
      `I run ${config.brand}, a public index that scores storefronts on how well autonomous shopping agents can read and buy from them. The agents in ChatGPT, Perplexity, and Gemini increasingly fetch a store on a customer's behalf before a human ever opens the page.`,
      '',
      `${record.domain} scored ${record.score}/100. The largest gap: ${top ? top.label.toLowerCase() : 'structural markup'} — ${gapNote}.`,
      '',
      `Concretely, that shows up as ${fixLine}.`,
      '',
      `The public breakdown is here: ${publicPage}`,
      '',
      `I built a specific fix pack for ${record.domain}: the exact llms.txt, the robots.txt lines, the JSON-LD block, and the order to apply them. It takes a template change, not a rebuild.`,
      '',
      `Want me to send it over?`,
      '',
      `— ${config.brand}`,
      publicUrl(''),
    ].join('\n');

    return {
      domain: record.domain,
      score: record.score,
      grade: record.grade,
      platform: record.platform,
      topGap: top ? top.label : null,
      topGapDelta: top ? top.max - top.earned : 0,
      contactUrl,
      publicPage,
      subject,
      body,
    };
  });
}

export async function writeOutreach(records, outDir) {
  const queue = buildOutreach(records);
  const dir = path.join(outDir, 'outreach');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'queue.json'), JSON.stringify({ generatedAt: new Date().toISOString(), count: queue.length, queue }, null, 2));

  for (const item of queue) {
    const text = `To: ${item.contactUrl || '(find the contact channel)'}\nSubject: ${item.subject}\n\n${item.body}\n`;
    await writeFile(path.join(dir, `${slug(item.domain)}.txt`), text);
  }

  return queue;
}
