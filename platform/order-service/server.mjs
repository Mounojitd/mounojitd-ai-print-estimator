// Order & payment service — Phase 1.7 of PLATFORM_PLAN.md §3.5. Turns a saved, confirmed QUOTE into an
// ORDER with an advance/balance (or credit) payment schedule, and takes payment through a PLUGGABLE gateway.
//
// Design rules (roadmap risk notes):
//  · advance/balance + credit terms are first-class, not bolted on.
//  · the gateway is pluggable from day one (gateways/*.mjs) — the mock provider ships for dev/test.
//  · checkout NEVER re-prices: the order honours the quoted total snapshot. "AI guides, math decides."
//
//   POST /orders                 {quoteToken, advancePct?, terms?, creditNetDays?}  -> order + schedule
//   GET  /orders/:ref
//   GET  /orders                 [?limit=]
//   POST /orders/:ref/pay        {portion: advance|balance|full}                    -> payment intent + payUrl
//   POST /webhooks/:provider     (provider callback; verified per gateway)          -> marks paid
//   GET  /pay/:intentId          mock hosted-checkout page (dev only)
//   POST /pay/:intentId/complete mock "Pay now" (dev only)  -> same effect as a paid webhook
//   GET  /checkout/:token        customer checkout page for a quote
//   GET  /health
//
// Env: PORT (8798) · QUOTE_DATA_DIR (shared quote store) · ORDER_DATA_DIR · GATEWAY (default mock)
//      DEFAULT_ADVANCE_PCT (default 50) · CREDIT_NET_DAYS (default 15)
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { store as quotes } from '../quote-service/store.mjs';
import { store, deriveStatus, addDays, nowISO } from './store.mjs';
import { resolveGateway } from './gateways/index.mjs';

const PORT = Number(process.env.PORT || 8798);
const DEFAULT_ADVANCE_PCT = Number(process.env.DEFAULT_ADVANCE_PCT || 50);
const CREDIT_NET_DAYS = Number(process.env.CREDIT_NET_DAYS || 15);
const gateway = resolveGateway();

const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(b); };
const html = (res, code, s) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(s); };
const body = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => ok(d)); req.on('error', no); });
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Create (or return the existing) order for a confirmed quote. Idempotent per quote token.
function ensureOrder(token, opts = {}) {
  const q = quotes.getByToken(token);
  if (!q) return { error: 404, msg: 'quote not found' };
  if (!q.price || !(q.price.grand > 0)) return { error: 422, msg: 'quote is not priceable' };
  const existing = store.getOrderByQuote(token);
  if (existing) return { order: existing, created: false };

  const total = q.price.grand;
  const terms = opts.terms === 'credit' ? 'credit' : 'advance';
  const advancePct = terms === 'credit' ? 0 : clamp(Number(opts.advancePct ?? DEFAULT_ADVANCE_PCT), 0, 100);
  const advanceAmount = Math.round((total * advancePct) / 100);
  const balanceAmount = total - advanceAmount;
  const creditNetDays = terms === 'credit' ? Number(opts.creditNetDays ?? CREDIT_NET_DAYS) : null;
  const dueDate = terms === 'credit' && q.deliveryDate ? addDays(q.deliveryDate, creditNetDays) : null;
  const ref = 'ORD-' + randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

  const order = store.createOrder({
    ref, quoteToken: token, created_at: nowISO(), status: terms === 'credit' ? 'on_credit' : 'awaiting_advance',
    customer: q.customer || null, product: q.product, quantity: q.quantity,
    total, currency: 'INR', terms, advancePct, advanceAmount, balanceAmount, creditNetDays,
    deliveryDate: q.deliveryDate || null, dueDate, ratecardVersion: q.ratecardVersion || null,
  });
  quotes.setStatus(token, 'confirmed');
  return { order, created: true };
}

function amountFor(order, portion, paidSum) {
  if (portion === 'advance') return order.advanceAmount;
  if (portion === 'balance') return order.balanceAmount;
  if (portion === 'full') return order.total - paidSum;
  return 0;
}

// Mark a payment paid (shared by the mock "Pay now" and the real provider webhook), then re-derive status.
function markIntentPaid(intentId) {
  const p = store.getPaymentByIntent(intentId);
  if (!p) return { error: 404, msg: 'payment intent not found' };
  if (p.status !== 'paid') store.updatePayment(intentId, { status: 'paid', paid_at: nowISO() });
  const payments = store.paymentsForOrder(p.orderRef);
  const order = store.getOrder(p.orderRef);
  const status = deriveStatus(order, payments);
  const updated = store.updateOrder(p.orderRef, { status });
  return { order: updated, payment: store.getPaymentByIntent(intentId) };
}

function orderView(order) {
  const payments = store.paymentsForOrder(order.ref);
  const paid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  return { ...order, paid, outstanding: order.total - paid, payments };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const path = u.pathname;
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'OPTIONS') return json(res, 204, {});

    if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, gateway: gateway.name, defaultAdvancePct: DEFAULT_ADVANCE_PCT, orders: store.listOrders({ limit: 1e9 }).length });

    // ---- create order from a quote ----
    if (req.method === 'POST' && path === '/orders') {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (!input.quoteToken) return json(res, 400, { error: 'quoteToken is required' });
      const r = ensureOrder(input.quoteToken, input);
      if (r.error) return json(res, r.error, { error: r.msg });
      return json(res, r.created ? 201 : 200, orderView(r.order));
    }

    // ---- list / get ----
    if (req.method === 'GET' && path === '/orders') return json(res, 200, store.listOrders({ limit: Number(u.searchParams.get('limit')) || 50 }));
    if (req.method === 'GET' && seg[0] === 'orders' && seg.length === 2) { const o = store.getOrder(seg[1]); return o ? json(res, 200, orderView(o)) : json(res, 404, { error: 'order not found' }); }

    // ---- start a payment (advance / balance / full) ----
    if (req.method === 'POST' && seg[0] === 'orders' && seg.length === 3 && seg[2] === 'pay') {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { input = {}; }
      const order = store.getOrder(seg[1]);
      if (!order) return json(res, 404, { error: 'order not found' });
      const payments = store.paymentsForOrder(order.ref);
      const paidSum = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
      let portion = input.portion;
      if (!portion) portion = order.terms === 'credit' ? 'full' : (paidSum < order.advanceAmount ? 'advance' : 'balance');
      if (!['advance', 'balance', 'full'].includes(portion)) return json(res, 400, { error: "portion must be advance|balance|full" });
      if (payments.some((p) => p.status === 'paid' && p.portion === portion)) return json(res, 409, { error: `${portion} already paid` });
      const amount = amountFor(order, portion, paidSum);
      if (!(amount > 0)) return json(res, 409, { error: 'nothing due for this portion' });
      const intent = await gateway.createIntent({ orderRef: order.ref, portion, amount, currency: order.currency });
      const payment = store.createPayment({ orderRef: order.ref, portion, amount, provider: gateway.name, intentId: intent.intentId, status: 'created', created_at: nowISO() });
      return json(res, 201, { payment, portion, amount, payUrl: intent.payUrl });
    }

    // ---- real provider webhook ----
    if (req.method === 'POST' && seg[0] === 'webhooks' && seg.length === 2) {
      const raw = await body(req);
      const { intentId, status } = gateway.verifyWebhook(raw, req.headers);
      if (!intentId) return json(res, 400, { error: 'could not verify webhook' });
      if (status !== 'paid') { if (intentId) store.updatePayment(intentId, { status: status || 'failed' }); return json(res, 200, { ok: true, status }); }
      const r = markIntentPaid(intentId);
      return r.error ? json(res, r.error, { error: r.msg }) : json(res, 200, { ok: true, order: r.order });
    }

    // ---- mock hosted checkout (dev only) ----
    if (req.method === 'POST' && seg[0] === 'pay' && seg.length === 3 && seg[2] === 'complete') {
      const r = markIntentPaid(seg[1]);
      return r.error ? json(res, r.error, { error: r.msg }) : json(res, 200, { ok: true, order: r.order, payment: r.payment });
    }
    if (req.method === 'GET' && seg[0] === 'pay' && seg.length === 2) {
      const p = store.getPaymentByIntent(seg[1]);
      if (!p) return html(res, 404, '<p>payment not found</p>');
      const order = store.getOrder(p.orderRef);
      return html(res, 200, mockPayPage(p, order));
    }

    // ---- customer checkout page for a quote ----
    if (req.method === 'GET' && seg[0] === 'checkout' && seg.length === 2) return html(res, 200, checkoutPage(seg[1]));

    json(res, 404, { error: 'not found', see: 'GET /health' });
  } catch (e) { json(res, e.code || 500, { error: String(e.message || e) }); }
});

server.listen(PORT, () => console.log(`order-service on http://127.0.0.1:${PORT}  (gateway: ${gateway.name}; checkout at /checkout/:token)`));

// ---------- tiny server-rendered pages (dev demo) ----------
const S = `<style>body{font:15px -apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#111827;margin:0}
.wrap{max-width:520px;margin:40px auto;padding:0 16px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:22px;margin:16px 0}
h1{font-size:18px}h2{font-size:15px;margin:0 0 10px}.big{font-size:28px;font-weight:700}.mut{color:#6b7280;font-size:13px}
table{width:100%;border-collapse:collapse}td{padding:6px 0}td:last-child{text-align:right;font-variant-numeric:tabular-nums}
button{background:#1f6feb;color:#fff;border:0;border-radius:8px;padding:11px 18px;font:inherit;font-weight:600;cursor:pointer}
.badge{display:inline-block;background:#ecfdf5;color:#0f7b3f;border:1px solid #a7f3d0;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:600}
.pill{display:inline-block;background:#eef2ff;color:#3452b4;border-radius:6px;padding:2px 8px;font-size:12px}</style>`;
const rupee = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

function mockPayPage(p, order) {
  return `<!doctype html><meta charset=utf-8><title>Pay ${rupee(p.amount)}</title>${S}<div class=wrap><div class=card>
  <div class=mut>MOCK GATEWAY · no real money</div>
  <h1>Pay ${p.portion} for ${order ? order.ref : ''}</h1>
  <div class=big>${rupee(p.amount)}</div>
  <p class=mut>Intent ${p.intentId}</p>
  <button id=b onclick="pay()">Pay ${rupee(p.amount)} now</button>
  <p id=msg class=mut></p></div></div>
  <script>async function pay(){document.getElementById('b').disabled=true;document.getElementById('msg').textContent='Processing…';
  const r=await fetch('/pay/${p.intentId}/complete',{method:'POST'});const j=await r.json();
  if(j.ok){document.getElementById('msg').innerHTML='✓ Paid. Order is now <b>'+j.order.status+'</b>. <a href="/checkout/'+j.order.quoteToken+'">Back to order</a>';}
  else{document.getElementById('msg').textContent='Failed: '+(j.error||'');document.getElementById('b').disabled=false;}}</script>`;
}

function checkoutPage(token) {
  return `<!doctype html><meta charset=utf-8><title>Checkout</title>${S}<div class=wrap><div class=card id=box>Loading…</div></div>
  <script>
  const token=${JSON.stringify(token)}, inr=(n)=>'₹'+Math.round(n).toLocaleString('en-IN');
  async function j(p,o){const r=await fetch(p,o);return r.json();}
  async function load(){
    let o=await j('/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({quoteToken:token})});
    if(o.error){document.getElementById('box').innerHTML='<p>Could not load order: '+o.error+'</p>';return;}
    render(o);
  }
  function render(o){
    const paidP=(o.payments||[]).filter(p=>p.status==='paid').map(p=>p.portion);
    const sched = o.terms==='credit'
      ? '<tr><td>On credit (net '+o.creditNetDays+' days)</td><td>'+inr(o.total)+'</td></tr>'+(o.dueDate?'<tr><td class=mut>Due by</td><td class=mut>'+o.dueDate+'</td></tr>':'')
      : '<tr><td>Advance ('+o.advancePct+'%)</td><td>'+inr(o.advanceAmount)+(paidP.includes('advance')?' <span class=badge>PAID</span>':'')+'</td></tr>'+
        '<tr><td>Balance</td><td>'+inr(o.balanceAmount)+(paidP.includes('balance')?' <span class=badge>PAID</span>':'')+'</td></tr>';
    let action='';
    if(o.status==='settled') action='<p class=badge>FULLY PAID — thank you!</p>';
    else if(o.terms==='credit') action='<button onclick="pay(\\''+o.ref+'\\',\\'full\\')">Pay '+inr(o.outstanding)+' now</button> <span class=mut>or settle on invoice</span>';
    else if(!paidP.includes('advance')) action='<button onclick="pay(\\''+o.ref+'\\',\\'advance\\')">Pay advance '+inr(o.advanceAmount)+'</button>';
    else action='<button onclick="pay(\\''+o.ref+'\\',\\'balance\\')">Pay balance '+inr(o.balanceAmount)+'</button>';
    document.getElementById('box').innerHTML=
      '<div class=mut>Order '+o.ref+' · <span class=pill>'+o.status+'</span></div>'+
      '<h1>'+o.product+' × '+o.quantity.toLocaleString('en-IN')+'</h1>'+
      '<div class=big>'+inr(o.total)+'</div>'+
      (o.deliveryDate?'<p class=mut>Delivery by '+o.deliveryDate+'</p>':'')+
      '<h2 style="margin-top:16px">Payment schedule</h2><table>'+sched+
      '<tr><td><b>Paid</b></td><td><b>'+inr(o.paid)+'</b></td></tr><tr><td><b>Outstanding</b></td><td><b>'+inr(o.outstanding)+'</b></td></tr></table>'+
      '<div style="margin-top:16px">'+action+'</div>';
  }
  async function pay(ref,portion){
    const r=await j('/orders/'+ref+'/pay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({portion})});
    if(r.payUrl){location.href=r.payUrl;} else {alert(r.error||'could not start payment');}
  }
  load();
  </script>`;
}
