import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const STAMP = /^\d{4}-\d{2}-\d{2}\.json$/;

export async function saveSnapshot(records, outDir, date = new Date()) {
  const dir = path.join(outDir, 'history');
  await mkdir(dir, { recursive: true });
  const stamp = date.toISOString().slice(0, 10);
  const payload = { generatedAt: date.toISOString(), records };
  await writeFile(path.join(dir, `${stamp}.json`), JSON.stringify(payload, null, 2));
  return { stamp, payload };
}

export async function loadSnapshots(outDir) {
  const dir = path.join(outDir, 'history');
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => STAMP.test(f)).sort();
  const snapshots = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      snapshots.push({ file, stamp: file.replace('.json', ''), ...parsed });
    } catch {
      // A corrupt snapshot should never block the run.
    }
  }
  return snapshots;
}

export async function loadPrevious(outDir, currentStamp) {
  const all = await loadSnapshots(outDir);
  const prior = all.filter((s) => s.stamp < currentStamp);
  return prior.length ? prior[prior.length - 1] : null;
}

export function diffRecords(previous, current) {
  const prevMap = new Map(((previous && previous.records) || []).map((r) => [r.domain, r]));
  const nextMap = new Map(current.map((r) => [r.domain, r]));

  const changes = [];
  const added = [];
  const dropped = [];

  for (const [domain, record] of nextMap) {
    const before = prevMap.get(domain);
    if (!before) {
      added.push(domain);
      continue;
    }
    const from = before.score ?? null;
    const to = record.score ?? null;
    if (from === to) continue;
    changes.push({
      domain,
      platform: record.platform,
      from,
      to,
      delta: (to ?? 0) - (from ?? 0),
      blocked: record.blocked === true,
      unblocked: before.blocked === true && record.blocked !== true,
    });
  }

  for (const domain of prevMap.keys()) if (!nextMap.has(domain)) dropped.push(domain);

  changes.sort((a, b) => b.delta - a.delta);

  return {
    previousStamp: previous ? previous.stamp : null,
    added,
    dropped,
    improved: changes.filter((c) => c.delta > 0),
    regressed: changes.filter((c) => c.delta < 0),
    newlyBlocked: changes.filter((c) => c.blocked && !c.unblocked),
    changes,
  };
}
