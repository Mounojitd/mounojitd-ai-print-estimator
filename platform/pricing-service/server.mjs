// Pricing service — exposes the VALIDATED estimator engine (paper_calculator.html) as an HTTP API.
// This is Phase 0.4a of PLATFORM_PLAN.md: "AI guides, math decides" — one deterministic engine that
// everything else calls. It reuses the engine EXACTLY as validated against NK Sir's 341 jobs (no re-port),
// by driving it headless the same way the test harnesses do.
//
//   POST /estimate  {brief, product?, qty?, margin?}  -> itemised estimate + lead time (JSON)
//   GET  /health
//
// Env: PORT (default 8787) · ENGINE_PATH (default ../../paper_calculator.html) · PLAYWRIGHT_MODULE (optional
// absolute path to playwright, e.g. /opt/node22/lib/node_modules/playwright — falls back to the installed dep).
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { store } from '../api/store.mjs';   // P0.4c: read rate cards from the shared catalog store (Postgres in prod)

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const ENGINE_PATH = process.env.ENGINE_PATH || resolve(__dir, '../../paper_calculator.html');

let RATECARD_FINGERPRINT = 'none';   // stamped on every estimate for reproducibility

// P0.4c — build engine overrides from the rate-card data (the same records the admin edits).
function buildOverrides() {
  const cards = store.listRateCards();
  const ov = { margins: {}, bindings: {}, printSources: {}, lfMedia: {}, pouchMedia: {}, lanyardMedia: {}, ncrPly: {}, rigidStyles: {} };
  let vsum = 0;
  for (const c of cards) {
    vsum += c.version; const v = c.values;
    switch (c.category) {
      case 'product_margin':   ov.margins[c.key] = v.margin_pct; break;
      case 'binding':          ov.bindings[c.key] = [v.rate, v.minimum]; break;
      case 'press_source':     ov.printSources[c.key] = v; break;
      case 'largeformat_media':ov.lfMedia[c.key] = { r: v.rate_per_sqft, name: c.label }; break;
      case 'pouch_media':      ov.pouchMedia[c.key] = { r: v.rate_per_pc, name: c.label, fabric: !!v.fabric }; break;
      case 'lanyard_media':    ov.lanyardMedia[c.key] = { r: v.rate_per_pc, name: c.label }; break;
      case 'ncr_ply_rate':     ov.ncrPly[c.key] = v.rate_per_ply; break;
      case 'rigidbox_style':   ov.rigidStyles[c.key] = { name: c.label, lid: !!v.lid, mult: v.area_multiplier }; break;
    }
  }
  return { ov, fingerprint: `rc-${cards.length}-${vsum}` };
}
// Inject the overrides into the engine by MUTATING its rate-card globals (const objects, mutable contents).
// Seed values equal the engine's own, so this is a no-op until an admin edits a rate — then prices move.
async function applyOverrides(page) {
  const { ov, fingerprint } = buildOverrides();
  await page.evaluate((ov) => {
    const put = (name, map, xform) => { try { const g = eval(name); if (!g) return; for (const k in map) g[k] = xform ? xform(map[k], g[k]) : map[k]; } catch {} };
    put('MARGIN_DEFAULT', ov.margins);
    put('BINDING', ov.bindings);
    put('PRINT_SOURCES', ov.printSources);
    put('LF_MEDIA', ov.lfMedia);
    put('POUCH_MEDIA', ov.pouchMedia);
    put('LANYARD_MEDIA', ov.lanyardMedia);
    put('NCR_PLY_RATE', ov.ncrPly);
    put('RIGIDBOX_STYLES', ov.rigidStyles);
    return true;
  }, ov);
  RATECARD_FINGERPRINT = fingerprint;
  return fingerprint;
}

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright/index.js'].filter(Boolean);
  for (const c of candidates) { try { const m = await import(c); const ch = m.chromium || (m.default && m.default.chromium); if (ch) return ch; } catch {} }
  throw new Error('playwright not found — set PLAYWRIGHT_MODULE or `npm i playwright`');
}

// The engine keeps global state on one page, so requests must be serialized (one at a time).
let queue = Promise.resolve();
const serialize = (fn) => (queue = queue.then(fn, fn)).catch(() => {});

let page; // the single reused engine page

async function estimate({ brief, product, qty, margin }) {
  if (!brief || typeof brief !== 'string') throw Object.assign(new Error('brief (string) is required'), { code: 400 });
  const out = await page.evaluate(({ brief, product, qty, margin }) => {
    const $ = (id) => document.getElementById(id);
    resetParserFields();
    applyVoiceSpec(brief);
    if (product && $('product') && $('product').value !== product) { $('product').value = product; onProductChange(); }
    if (qty > 0) { if ($('copies2')) $('copies2').value = qty; if ($('copies')) $('copies').value = qty; }
    if (margin != null && $('margin')) $('margin').value = margin;
    if (typeof applyGangedDefault === 'function') applyGangedDefault();
    if (typeof applyMenuRateHint === 'function') applyMenuRateHint();
    if (typeof applyMarginDefault === 'function' && margin == null) applyMarginDefault();
    run();
    const err = $('err') ? $('err').textContent.trim() : '';
    const x = combinedPrice(); const q = x.q || {};
    const prod = $('product') ? $('product').value : '';
    const c = $('copies2') || $('copies');
    const usedQty = c ? (parseInt(String(c.value).replace(/[^0-9]/g, ''), 10) || 0) : 0;
    const bind = $('binding') ? $('binding').value : 'none';
    const lead = (typeof leadTimeDays === 'function') ? leadTimeDays(prod, usedQty, bind) : null;
    const mr = parseFloat(($('flatRatePc') || {}).value) || 0, mn = parseFloat(($('flatRateMin') || {}).value) || 0;
    const unpriceable = !!x.unpriceable || !!err;
    return {
      product: prod, quantity: usedQty,
      unpriceable, reason: unpriceable ? (err || x.reason || 'no valid spec') : null,
      leadTimeDays: lead,
      price: unpriceable ? null : {
        grand: Math.round(q.grand || 0),
        unit: q.unit ? +(q.unit).toFixed(2) : null,
        paper: Math.round(q.paper || 0), printing: Math.round(q.printing || 0), plates: Math.round(q.plates || 0),
        coating: Math.round(q.lam || 0), margin: Math.round(q.margin || 0), gst: Math.round(q.gst || 0),
        menuRate: (mr > 0 && usedQty > 0) ? Math.round(Math.max(mr * usedQty, mn)) : null,
      },
    };
  }, { brief, product, qty, margin });
  out.ratecardVersion = RATECARD_FINGERPRINT;   // reproducibility: which rate-card set produced this quote
  return out;
}

function send(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) }); res.end(b); }
function readBody(req) { return new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => ok(d)); req.on('error', no); }); }

async function main() {
  const chromium = await loadPlaywright();
  const browser = await chromium.launch();
  page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(pathToFileURL(ENGINE_PATH).href, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  if (errors.length) console.error('engine load errors:', errors);
  const fp = await applyOverrides(page);   // P0.4c: load rate cards into the engine
  console.log(`pricing-service: engine loaded from ${ENGINE_PATH}; rate cards ${fp}`);

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, engine: ENGINE_PATH, ratecardVersion: RATECARD_FINGERPRINT });
    if (req.method === 'POST' && req.url === '/reload') return serialize(async () => { try { const f = await applyOverrides(page); send(res, 200, { ok: true, ratecardVersion: f }); } catch (e) { send(res, 500, { error: String(e.message || e) }); } });
    if (req.method === 'POST' && req.url === '/estimate') {
      return serialize(async () => {
        try {
          const body = await readBody(req);
          const input = body ? JSON.parse(body) : {};
          const out = await estimate(input);
          send(res, 200, out);
        } catch (e) { send(res, e.code === 400 ? 400 : 500, { error: String(e.message || e) }); }
      });
    }
    send(res, 404, { error: 'not found — use GET /health or POST /estimate' });
  });
  server.listen(PORT, () => console.log(`pricing-service listening on http://127.0.0.1:${PORT}`));
  const shut = async () => { try { await browser.close(); } catch {} process.exit(0); };
  process.on('SIGINT', shut); process.on('SIGTERM', shut);
}
main().catch((e) => { console.error(e); process.exit(1); });
