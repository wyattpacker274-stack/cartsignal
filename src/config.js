import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, 'config.json');
const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};

export const config = {
  brand: process.env.CARTSIGNAL_BRAND || raw.brand || 'CartSignal',
  baseUrl: String(process.env.CARTSIGNAL_BASE_URL || raw.baseUrl || 'http://localhost:4173').replace(/\/+$/, ''),
  ownerEmail: process.env.CARTSIGNAL_OWNER_EMAIL || raw.ownerEmail || '',
  fromEmail: process.env.CARTSIGNAL_FROM || raw.fromEmail || 'CartSignal <onboarding@resend.dev>',
  vertical: raw.vertical || 'unset',
  checkoutUrl: process.env.CARTSIGNAL_CHECKOUT_URL || raw.checkoutUrl || '',
  scan: raw.scan || { file: 'data/sites.txt', concurrency: 4 },
  pricing: raw.pricing || { fixPack: 299, monitorMonthly: 49, currency: 'usd' },
  outreach: raw.outreach || { threshold: 60, limit: 30 },
  root: ROOT,
  out: path.join(ROOT, 'out'),
};

export function publicUrl(pathname = '') {
  return `${config.baseUrl}/${String(pathname).replace(/^\/+/, '')}`;
}
