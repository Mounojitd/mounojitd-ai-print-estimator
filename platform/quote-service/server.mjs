// Quote service — Phase 1, the CUSTOMER slice of PLATFORM_PLAN.md §3.4:
//   showcase  →  AI intake (plain-language brief)  →  spec confirm  →  estimate  →  saved, shareable quote
//                                                                                    with a delivery date.
// It is ordinary glue code: the PRICE comes from the validated pricing-service (P0.4a/c), the CATALOG from
// the shared catalog store (P0.4b). This service adds: intake preview, quote persistence, share-by-token,
// and the delivery-date calc. No pricing logic lives here — "AI guides, math decides".
//
//   GET  /health
//   GET  /catalog            [?family=]     product showcase (templates)
//   POST /intake             {brief, product?, qty?, margin?}      -> priced PREVIEW (not saved) to confirm
//   POST /quotes             {brief, ..., customer?, asOf?}        -> saves + returns a shareable quote
//   GET  /quotes/:token                                            -> the shared quote
//   GET  /quotes             [?limit=]                             -> recent quotes (owner view)
//   GET  /                                                         -> customer web app (public/index.html)
//
// Env: PORT (8795) · PRICING_URL (http://127.0.0.1:8787) · QUOTE_DATA_DIR · DATA_DIR (catalog store).
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { store as catalog } from '../api/store.mjs';
import { servePhoto } from '../api/photos.mjs';
import { store as quotes, addWorkingDays, nowISO } from './store.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8795);
const PRICING_URL = process.env.PRICING_URL || 'http://127.0.0.1:8787';
const ORDER_CHECKOUT_BASE = process.env.ORDER_CHECKOUT_URL || '';   // P1.7: if set, "Confirm order" → order-service checkout
const APP = resolve(__dir, 'public', 'index.html');

const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(b); };
const body = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => ok(d)); req.on('error', no); });
const today = () => { try { return new Date().toISOString().slice(0, 10); } catch { return '2026-07-25'; } };

// Ask the validated engine for a price. Throws (500) if the pricing service is unreachable — we never guess.
async function price({ brief, product, qty, margin }) {
  let r;
  try {
    r = await fetch(`${PRICING_URL}/estimate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief, product, qty, margin }) });
  } catch (e) { throw Object.assign(new Error(`pricing service unreachable at ${PRICING_URL}: ${e.message}`), { code: 502 }); }
  const out = await r.json();
  if (!r.ok) throw Object.assign(new Error(out.error || 'pricing failed'), { code: 502 });
  return out;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const path = u.pathname;
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'OPTIONS') return json(res, 204, {});

    if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, pricingUrl: PRICING_URL, catalog: catalog.listTemplates().length, quotes: quotes.list({ limit: 1e9 }).length });

    if (req.method === 'GET' && path === '/') {
      if (existsSync(APP)) {
        const app = readFileSync(APP, 'utf8').replace('/*__CONFIG__*/', `window.ORDER_CHECKOUT_BASE=${JSON.stringify(ORDER_CHECKOUT_BASE)};`);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(app);
      }
      return json(res, 200, { hint: 'customer app missing; use the JSON endpoints' });
    }

    // Product photos (real product pictures, one per product key) — served from PHOTOS_DIR.
    if (req.method === 'GET' && seg[0] === 'photos' && seg.length === 2) return void servePhoto(res, seg[1]);

    // Showcase — the product catalogue the customer picks from (with a real photo when we have one).
    if (req.method === 'GET' && path === '/catalog') {
      const family = u.searchParams.get('family') || undefined;
      const photos = catalog.productPhotos();
      return json(res, 200, catalog.listTemplates({ family }).map((t) => ({ key: t.key, label: t.label, family: t.family, engine_product_key: t.engine_product_key, photo: photos[t.engine_product_key] || null })));
    }

    // Intake — turn a plain-language brief into a priced PREVIEW the customer confirms before saving.
    if (req.method === 'POST' && path === '/intake') {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (!input.brief || typeof input.brief !== 'string') return json(res, 400, { error: 'brief (string) is required' });
      const est = await price(input);
      return json(res, 200, {
        brief: input.brief, product: est.product, quantity: est.quantity, spec: est.spec || {},
        unpriceable: est.unpriceable, reason: est.reason, leadTimeDays: est.leadTimeDays,
        price: est.price, ratecardVersion: est.ratecardVersion,
      });
    }

    // Save a quote: price it, stamp versions + delivery date, mint a share token.
    if (req.method === 'POST' && path === '/quotes') {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (!input.brief || typeof input.brief !== 'string') return json(res, 400, { error: 'brief (string) is required' });
      const est = await price(input);
      if (est.unpriceable) return json(res, 422, { error: 'this spec is not priceable yet', reason: est.reason, brief: input.brief });
      const asOf = /^\d{4}-\d{2}-\d{2}$/.test(input.asOf || '') ? input.asOf : today();
      const token = randomUUID().replace(/-/g, '').slice(0, 12);
      const row = quotes.create({
        token, created_at: nowISO(), asOf, status: 'draft',
        customer: input.customer && typeof input.customer === 'object' ? { name: input.customer.name || '', phone: input.customer.phone || '', email: input.customer.email || '' } : null,
        brief: input.brief, product: est.product, quantity: est.quantity, margin: input.margin ?? null,
        spec: est.spec || {}, price: est.price, leadTimeDays: est.leadTimeDays, traveller: est.traveller || [],
        deliveryDate: addWorkingDays(asOf, est.leadTimeDays),
        ratecardVersion: est.ratecardVersion || null, engineVersion: null,
      });
      return json(res, 201, { ...row, shareUrl: `/quotes/${token}` });
    }

    // Fetch a saved quote by its share token.
    if (req.method === 'GET' && seg[0] === 'quotes' && seg.length === 2) {
      const q = quotes.getByToken(seg[1]);
      return q ? json(res, 200, q) : json(res, 404, { error: 'quote not found' });
    }
    // Owner view — recent quotes.
    if (req.method === 'GET' && path === '/quotes') return json(res, 200, quotes.list({ limit: Number(u.searchParams.get('limit')) || 50 }));

    // Confirm a quote (customer accepts the spec/price; order & payment is P1.7).
    if (req.method === 'POST' && seg[0] === 'quotes' && seg.length === 3 && seg[2] === 'confirm') {
      const q = quotes.setStatus(seg[1], 'confirmed');
      return q ? json(res, 200, q) : json(res, 404, { error: 'quote not found' });
    }

    json(res, 404, { error: 'not found', see: 'GET /health' });
  } catch (e) { json(res, e.code || 500, { error: String(e.message || e) }); }
});

server.listen(PORT, () => console.log(`quote-service on http://127.0.0.1:${PORT}  (customer app at /; pricing at ${PRICING_URL})`));
