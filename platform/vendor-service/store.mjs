// Repository over vendors + purchase orders (Phase B4/B5). DEV store = JSON files; PROD = Postgres
// (schema.sql), same method surface. Vendors bootstrap from vendors.seed.json on first run (synthetic in the
// repo; the real Vendor Master is loaded locally via tools/import_vendors.py and gitignored). A PO snapshots
// its lines + vendor terms; its status is a simple lifecycle the buyer drives.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.VENDOR_DATA_DIR || resolve(__dir, 'data');
const F = { vendors: resolve(DATA, 'vendors.json'), pos: resolve(DATA, 'pos.json'), seed: resolve(__dir, 'data', 'vendors.seed.json') };
const load = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
const save = (p, v) => { if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 1)); };

export const store = {
  // first run: seed vendors from the committed synthetic seed (never overwrites an existing store)
  seedIfEmpty() { if (!existsSync(F.vendors)) save(F.vendors, load(F.seed, [])); return load(F.vendors, []); },

  // ---- vendors ----
  listVendors({ capability, type } = {}) {
    let v = load(F.vendors, []);
    if (type) v = v.filter((x) => x.type === type);
    if (capability) v = v.filter((x) => (x.capabilities || []).includes(capability));
    return v;
  },
  getVendor(id) { return load(F.vendors, []).find((v) => v.id === id) || null; },
  createVendor(v) { const all = load(F.vendors, []); const row = { id: v.id || nextId(all), active: true, capabilities: [], ...v }; all.push(row); save(F.vendors, all); return row; },
  updateVendor(id, patch) { const all = load(F.vendors, []); const i = all.findIndex((v) => v.id === id); if (i < 0) return null; all[i] = { ...all[i], ...patch }; save(F.vendors, all); return all[i]; },

  // ---- purchase orders ----
  createPO(po) { const all = load(F.pos, []); const row = { id: all.length + 1, ...po }; all.push(row); save(F.pos, all); return row; },
  getPO(ref) { return load(F.pos, []).find((p) => p.ref === ref) || null; },
  posForJob(jobRef) { return load(F.pos, []).filter((p) => p.jobRef === jobRef); },
  listPOs({ limit = 100 } = {}) { return load(F.pos, []).slice(-limit).reverse(); },
  updatePO(ref, patch) { const all = load(F.pos, []); const i = all.findIndex((p) => p.ref === ref); if (i < 0) return null; all[i] = { ...all[i], ...patch, updated_at: nowISO() }; save(F.pos, all); return all[i]; },
};

function nextId(all) { const n = all.reduce((m, v) => Math.max(m, parseInt(String(v.id).replace(/\D/g, ''), 10) || 0), 0) + 1; return 'VEN' + String(n).padStart(3, '0'); }
export function nowISO() { try { return new Date().toISOString(); } catch { return '2026-07-25T00:00:00Z'; } }
