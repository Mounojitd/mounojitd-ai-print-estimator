// Catalog + rate-card API — Phase 0.4b. CRUD over templates and rate cards (the "rate cards as data"
// layer). Serves the admin panel at /. Backed by store.mjs (JSON dev store; Postgres in prod via schema.sql).
//
//   GET  /health
//   GET  /templates            [?family=]
//   GET  /templates/:key
//   GET  /rate-cards           [?category=]
//   GET  /rate-cards/categories
//   GET  /rate-cards/:category/:key
//   PUT  /rate-cards/:category/:key      body {values, label?}  -> updates + versions + logs history
//   GET  /rate-cards/:category/:key/history
//   GET  /  (admin panel)
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { store } from './store.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8790);
const ADMIN = resolve(__dir, 'admin', 'index.html');

const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PUT,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(b); };
const body = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => ok(d)); req.on('error', no); });

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://x`);
    const path = u.pathname;
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'OPTIONS') return json(res, 204, {});

    if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, templates: store.listTemplates().length, rateCards: store.listRateCards().length });

    if (req.method === 'GET' && path === '/') {
      if (existsSync(ADMIN)) { const html = readFileSync(ADMIN); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html); }
      return json(res, 200, { hint: 'admin panel missing; use the JSON endpoints' });
    }

    // templates
    if (req.method === 'GET' && seg[0] === 'templates' && seg.length === 1) return json(res, 200, store.listTemplates({ family: u.searchParams.get('family') || undefined }));
    if (req.method === 'GET' && seg[0] === 'templates' && seg.length === 2) { const t = store.getTemplate(seg[1]); return t ? json(res, 200, t) : json(res, 404, { error: 'template not found' }); }

    // rate cards
    if (req.method === 'GET' && seg[0] === 'rate-cards' && seg[1] === 'categories') return json(res, 200, store.rateCategories());
    if (req.method === 'GET' && seg[0] === 'rate-cards' && seg.length === 1) return json(res, 200, store.listRateCards({ category: u.searchParams.get('category') || undefined }));
    if (req.method === 'GET' && seg[0] === 'rate-cards' && seg.length === 3) { const c = store.getRateCard(seg[1], seg[2]); return c ? json(res, 200, c) : json(res, 404, { error: 'rate card not found' }); }
    if (req.method === 'GET' && seg[0] === 'rate-cards' && seg.length === 4 && seg[3] === 'history') return json(res, 200, store.historyFor(seg[1], seg[2]));
    if (req.method === 'PUT' && seg[0] === 'rate-cards' && seg.length === 3) {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (input.values == null && input.label == null) return json(res, 400, { error: 'nothing to update (send values and/or label)' });
      const updated = store.updateRateCard(seg[1], seg[2], input);
      return updated ? json(res, 200, updated) : json(res, 404, { error: 'rate card not found' });
    }

    json(res, 404, { error: 'not found', see: 'GET /health' });
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
});

server.listen(PORT, () => console.log(`catalog/rate-card API on http://127.0.0.1:${PORT}  (admin panel at /)`));
