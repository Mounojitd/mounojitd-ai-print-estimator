// Repository over saved quotes (Phase 1 — the customer slice). DEV store = a JSON file (no native deps);
// PROD target = Postgres (schema.sql), same method surface so swapping is a drop-in.
// A quote snapshots {spec, itemised price, engine + rate-card version, lead time, delivery date} so it is
// reproducible and shareable by an opaque token.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.QUOTE_DATA_DIR || resolve(__dir, 'data');   // override for tests so nothing leaks into the repo
const FILE = resolve(DATA, 'quotes.json');
const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : []);
const save = (v) => { if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true }); writeFileSync(FILE, JSON.stringify(v, null, 1)); };

export const store = {
  create(q) {
    const all = load();
    const row = { id: all.length + 1, ...q };
    all.push(row);
    save(all);
    return row;
  },
  getByToken(token) { return load().find((q) => q.token === token) || null; },
  list({ limit = 50 } = {}) { return load().slice(-limit).reverse(); },
  setStatus(token, status) {
    const all = load();
    const i = all.findIndex((q) => q.token === token);
    if (i < 0) return null;
    all[i] = { ...all[i], status, updated_at: nowISO() };
    save(all);
    return all[i];
  },
};

export function nowISO() { try { return new Date().toISOString(); } catch { return '2026-07-25T00:00:00Z'; } }

// Delivery date = start date + N working days (skip Sundays — presses here run Mon–Sat). `asOf` is a
// 'YYYY-MM-DD' string; returns the same. Pure date math, no wall clock, so quotes are reproducible.
export function addWorkingDays(asOf, days) {
  if (days == null) return null;
  const [y, m, d] = asOf.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  let added = 0;
  while (added < days) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    if (dt.getUTCDay() !== 0) added++;   // 0 = Sunday
  }
  return dt.toISOString().slice(0, 10);
}
