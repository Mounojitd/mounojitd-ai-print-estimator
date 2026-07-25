// Repository over the catalog + rate-card data. DEV store = JSON files (no native deps, runs anywhere);
// PROD target = Postgres (schema.sql) — same method surface, so swapping is a drop-in (add a pg-backed
// store with these same methods). Edits append to a history log so any past quote's rates are reproducible.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || resolve(__dir, 'data');   // override for tests so the seed stays pristine
const paths = {
  templates: resolve(DATA, 'templates.json'),
  rate_cards: resolve(DATA, 'rate_cards.json'),
  rate_card_history: resolve(DATA, 'rate_card_history.json'),
  product_photos: resolve(DATA, 'product_photos.json'),
};
const load = (p, dflt) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : dflt);
const save = (p, v) => writeFileSync(p, JSON.stringify(v, null, 1));

export const store = {
  // ---- product templates ----
  listTemplates({ family } = {}) {
    let t = load(paths.templates, []);
    if (family) t = t.filter((x) => x.family === family);
    return t;
  },
  getTemplate(key) { return load(paths.templates, []).find((x) => x.key === key) || null; },

  // ---- product photos (one representative real photo per engine product key) ----
  // Map { engine_product_key -> url|null }. A real product photo lifts the showcase + B1 from text to
  // portfolio. url is whatever is reachable: a served /photos/<file>, a Drive/hosted URL, or a data URI.
  productPhotos() { return load(paths.product_photos, {}); },
  photoFor(key) { const p = load(paths.product_photos, {}); return p[key] || null; },

  // ---- rate cards ----
  listRateCards({ category } = {}) {
    let c = load(paths.rate_cards, []);
    if (category) c = c.filter((x) => x.category === category);
    return c;
  },
  getRateCard(category, key) {
    return load(paths.rate_cards, []).find((x) => x.category === category && x.key === key) || null;
  },
  rateCategories() {
    const cats = {};
    for (const c of load(paths.rate_cards, [])) cats[c.category] = (cats[c.category] || 0) + 1;
    return cats;
  },
  // Update a rate card's `values` (and optional label); bumps version + appends history.
  updateRateCard(category, key, { values, label, changed_by }) {
    const cards = load(paths.rate_cards, []);
    const i = cards.findIndex((x) => x.category === category && x.key === key);
    if (i < 0) return null;
    const prev = cards[i];
    const hist = load(paths.rate_card_history, []);
    hist.push({ id: hist.length + 1, rate_card_id: prev.id, category, key, version: prev.version, values: prev.values, changed_at: nowISO(), changed_by: changed_by || 'admin' });
    save(paths.rate_card_history, hist);
    cards[i] = { ...prev, values: values != null ? values : prev.values, label: label != null ? label : prev.label, version: prev.version + 1, updated_at: nowISO() };
    save(paths.rate_cards, cards);
    return cards[i];
  },
  historyFor(category, key) {
    return load(paths.rate_card_history, []).filter((h) => h.category === category && h.key === key);
  },
};

// Deterministic-ish timestamp without new Date() (blocked in some sandboxes); good enough for a change log.
function nowISO() { try { return new Date().toISOString(); } catch { return '2026-07-25T00:00:00Z'; } }
