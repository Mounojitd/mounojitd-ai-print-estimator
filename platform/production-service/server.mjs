// Production + actuals service — Phase B2/B3 of PLATFORM_PLAN.md §3.7.
//  B2: turn a paid order into a shop-floor JOB with the engine's production traveller (stage + QC), and
//      advance it stage by stage.
//  B3: capture ACTUALS against the job, compare to the estimate, and surface a rate-card correction
//      SUGGESTION per product. The suggestion is ADVISORY — a human approves it in the rate-card admin
//      (P0.4b) and the pricing service reloads (P0.4c). "AI guides, math decides" — we never auto-edit rates.
//
//   POST /jobs                         {orderRef}                     -> job with traveller (advance not paid → 409)
//   GET  /jobs/:ref  · GET /jobs
//   POST /jobs/:ref/stages/:i          {status, by?, note?, measured?} -> advance a stage
//   POST /jobs/:ref/actual             {amount, quantity?, spoilage?, note?} -> capture actuals (B3)
//   GET  /rate-suggestions             per-product estimate-vs-actual variance + advisory correction
//   GET  /                             shop-floor job board (traveller + actuals)
//
// Env: PORT (8800) · QUOTE_DATA_DIR · ORDER_DATA_DIR · PRODUCTION_DATA_DIR
//      MIN_JOBS_FOR_SUGGESTION (default 2) · VARIANCE_THRESHOLD_PCT (default 8)
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { store as quotes } from '../quote-service/store.mjs';
import { store as orders } from '../order-service/store.mjs';
import { store, deriveStatus, jobVariance, nowISO } from './store.mjs';

const PORT = Number(process.env.PORT || 8800);
const MIN_JOBS = Number(process.env.MIN_JOBS_FOR_SUGGESTION || 2);
const THRESHOLD = Number(process.env.VARIANCE_THRESHOLD_PCT || 8);

const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(b); };
const html = (res, code, s) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(s); };
const body = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => ok(d)); req.on('error', no); });
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Build a job from a paid order (reads the order + its quote for the traveller/spec/estimate).
function ensureJob(orderRef) {
  const order = orders.getOrder(orderRef);
  if (!order) return { error: 404, msg: 'order not found' };
  if (order.status === 'awaiting_advance') return { error: 409, msg: 'advance not paid — production cannot start yet' };
  const existing = store.getJobByOrder(orderRef);
  if (existing) return { job: existing, created: false };
  const quote = quotes.getByToken(order.quoteToken);
  const traveller = (quote && Array.isArray(quote.traveller) && quote.traveller.length)
    ? quote.traveller
    : [{ stage: 'Pre-press', qc: 'Artwork + proof approved' }, { stage: 'Production', qc: 'To spec' }, { stage: 'QC & dispatch', qc: 'Count, no defects, delivery note' }];
  const stages = traveller.map((t) => ({ stage: t.stage, qc: t.qc, status: 'pending', by: null, note: null, measured: null, at: null }));
  const ref = 'JOB-' + randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  const job = store.createJob({
    ref, orderRef, quoteToken: order.quoteToken, created_at: nowISO(), status: 'not_started',
    product: order.product, quantity: order.quantity, estimateAmount: order.total, currency: order.currency || 'INR',
    customer: order.customer || null, spec: (quote && quote.spec) || {}, deliveryDate: order.deliveryDate || null,
    stages, actual: null,
  });
  return { job, created: true };
}

// B3 — aggregate estimate-vs-actual variance per product, and turn a persistent gap into an advisory suggestion.
function rateSuggestions() {
  const byProduct = {};
  for (const j of store.allJobs()) {
    const v = jobVariance(j);
    if (!v) continue;
    (byProduct[j.product] = byProduct[j.product] || []).push(v.pct);
  }
  const out = [];
  for (const [product, pcts] of Object.entries(byProduct)) {
    const med = +median(pcts).toFixed(1);
    const mean = +(pcts.reduce((s, x) => s + x, 0) / pcts.length).toFixed(1);
    const actionable = pcts.length >= MIN_JOBS && Math.abs(med) >= THRESHOLD;
    out.push({
      product, jobs: pcts.length, medianVariancePct: med, meanVariancePct: mean, actionable,
      suggestion: actionable
        ? `Across ${pcts.length} closed ${product} jobs, actuals ran a median ${med > 0 ? '+' : ''}${med}% vs estimate — consider ${med > 0 ? 'RAISING' : 'LOWERING'} the '${product}' margin/rates. Review in the rate-card admin (PUT /rate-cards/product_margin/${product}); the pricing service picks it up on /reload.`
        : `Only ${pcts.length} job(s) or within ±${THRESHOLD}% — not enough signal to change rates yet.`,
    });
  }
  return out.sort((a, b) => Math.abs(b.medianVariancePct) - Math.abs(a.medianVariancePct));
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const path = u.pathname;
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'OPTIONS') return json(res, 204, {});

    if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, jobs: store.allJobs().length });
    if (req.method === 'GET' && path === '/') return html(res, 200, boardPage());

    // create job from order
    if (req.method === 'POST' && path === '/jobs') {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (!input.orderRef) return json(res, 400, { error: 'orderRef is required' });
      const r = ensureJob(input.orderRef);
      if (r.error) return json(res, r.error, { error: r.msg });
      return json(res, r.created ? 201 : 200, { ...r.job, status: deriveStatus(r.job) });
    }

    if (req.method === 'GET' && path === '/rate-suggestions') return json(res, 200, rateSuggestions());
    if (req.method === 'GET' && path === '/jobs') return json(res, 200, store.listJobs({ limit: Number(u.searchParams.get('limit')) || 100 }).map((j) => ({ ...j, status: deriveStatus(j), variance: jobVariance(j) })));

    if (req.method === 'GET' && seg[0] === 'jobs' && seg.length === 2) {
      const j = store.getJob(seg[1]);
      return j ? json(res, 200, { ...j, status: deriveStatus(j), variance: jobVariance(j) }) : json(res, 404, { error: 'job not found' });
    }

    // advance a stage
    if (req.method === 'POST' && seg[0] === 'jobs' && seg.length === 4 && seg[2] === 'stages') {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { input = {}; }
      const job = store.getJob(seg[1]);
      if (!job) return json(res, 404, { error: 'job not found' });
      const i = Number(seg[3]);
      if (!(i >= 0 && i < job.stages.length)) return json(res, 400, { error: 'stage index out of range' });
      const status = input.status || 'done';
      if (!['pending', 'in_progress', 'done'].includes(status)) return json(res, 400, { error: 'status must be pending|in_progress|done' });
      const st = { ...job.stages[i], status, by: input.by ?? job.stages[i].by, note: input.note ?? job.stages[i].note, measured: input.measured ?? job.stages[i].measured, at: status === 'done' ? nowISO() : job.stages[i].at };
      const stages = job.stages.map((s, k) => (k === i ? st : s));
      const updated = store.updateJob(job.ref, { stages });
      return json(res, 200, { ...updated, status: deriveStatus(updated) });
    }

    // capture actuals (B3)
    if (req.method === 'POST' && seg[0] === 'jobs' && seg.length === 3 && seg[2] === 'actual') {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      const job = store.getJob(seg[1]);
      if (!job) return json(res, 404, { error: 'job not found' });
      const amount = Number(input.amount);
      if (!(amount > 0)) return json(res, 400, { error: 'actual amount (>0) is required' });
      const actual = { amount, quantity: input.quantity != null ? Number(input.quantity) : null, spoilage: input.spoilage != null ? Number(input.spoilage) : null, note: input.note || null, at: nowISO() };
      const updated = store.updateJob(job.ref, { actual });
      return json(res, 200, { ...updated, status: deriveStatus(updated), variance: jobVariance(updated) });
    }

    json(res, 404, { error: 'not found', see: 'GET /health' });
  } catch (e) { json(res, e.code || 500, { error: String(e.message || e) }); }
});

server.listen(PORT, () => console.log(`production-service on http://127.0.0.1:${PORT}  (job board at /)`));

// ---------- shop-floor board (dev UI) ----------
function boardPage() {
  return `<!doctype html><meta charset=utf-8><title>Job board</title>
<style>body{font:15px -apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#111827;margin:0}
.wrap{max-width:820px;margin:28px auto;padding:0 16px}h1{font-size:19px}.mut{color:#6b7280;font-size:13px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0}
.pill{display:inline-block;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:600}
.s-not_started{background:#f3f4f6;color:#6b7280}.s-in_production{background:#eef2ff;color:#3452b4}.s-completed{background:#ecfdf5;color:#0f7b3f}.s-closed{background:#111827;color:#fff}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:8px}td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}
button{background:#1f6feb;color:#fff;border:0;border-radius:7px;padding:6px 12px;font:inherit;cursor:pointer;font-size:13px}
button.g{background:#fff;color:#1f6feb;border:1px solid #1f6feb}.done{color:#0f7b3f;font-weight:600}
input{padding:7px;border:1px solid #e5e7eb;border-radius:7px;font:inherit;width:120px}</style>
<div class=wrap><h1>Shop-floor job board <span class=mut>— traveller + actuals (B2/B3)</span></h1>
<p class=mut>Advance each stage as it clears QC. When the job ships, record the actual amount — variance feeds rate-card suggestions.</p>
<div id=out>Loading…</div>
<div class=card><h3 style="margin-top:0">Rate suggestions (B3)</h3><div id=sug class=mut>—</div></div></div>
<script>
const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const inr=(n)=>'₹'+Math.round(n).toLocaleString('en-IN');
async function j(p,o){const r=await fetch(p,o);return r.json();}
async function load(){
  const jobs=await j('/jobs');
  document.getElementById('out').innerHTML = jobs.length? jobs.map(job=>{
    const rows=job.stages.map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(s.stage)+'</td><td class=mut>'+esc(s.qc)+'</td><td>'+
      (s.status==='done'?'<span class=done>✓ done</span>':'<button class=g onclick="adv(\\''+job.ref+'\\','+i+')">mark done</button>')+'</td></tr>').join('');
    const v=job.variance;
    const act = job.actual
      ? '<div class=mut style="margin-top:8px">Actual '+inr(job.actual.amount)+' vs estimate '+inr(job.estimateAmount)+' → <b style="color:'+(v.pct>0?'#9a3412':'#0f7b3f')+'">'+(v.pct>0?'+':'')+v.pct+'%</b></div>'
      : '<div style="margin-top:8px">Actual amount: <input id="a-'+job.ref+'" type=number placeholder="final ₹"/> <button onclick="rec(\\''+job.ref+'\\')">record actual</button></div>';
    return '<div class=card><b>'+esc(job.ref)+'</b> · '+esc(job.product)+' × '+job.quantity.toLocaleString('en-IN')+
      ' <span class="pill s-'+job.status+'">'+job.status+'</span> <span class=mut>est '+inr(job.estimateAmount)+(job.deliveryDate?' · due '+esc(job.deliveryDate):'')+'</span>'+
      '<table><thead><tr><th>#</th><th>Stage</th><th>QC</th><th></th></tr></thead>'+rows+'</table>'+act+'</div>';
  }).join('') : '<div class=card class=mut>No jobs yet. Create one from a paid order: POST /jobs {orderRef}.</div>';
  const sug=await j('/rate-suggestions');
  document.getElementById('sug').innerHTML = sug.length? sug.map(s=>'<div style="margin:6px 0'+(s.actionable?';color:#9a3412;font-weight:500':'')+'">• '+esc(s.suggestion)+'</div>').join('') : 'No closed jobs with actuals yet.';
}
async function adv(ref,i){ await j('/jobs/'+ref+'/stages/'+i,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:'done',by:'floor'})}); load(); }
async function rec(ref){ const a=document.getElementById('a-'+ref).value; if(!a)return; await j('/jobs/'+ref+'/actual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({amount:Number(a)})}); load(); }
load();
</script>`;
}
