// Vendor + purchase-order service — Phase B4/B5 of PLATFORM_PLAN.md §3.8.
//  B4: a VENDOR master, and BOUGHT-OUT routing — classify each production-traveller stage as made in-house
//      or bought-out, and suggest vendors for the bought-out ones (by capability).
//  B5: PURCHASE ORDERS to a vendor for bought-out work — lines + amounts + the vendor's payment terms, with a
//      simple draft → issued → received → closed lifecycle. A PO can be seeded from a job's bought-out stages.
//
//   GET  /vendors [?capability=&type=] · GET /vendors/:id · POST /vendors · PUT /vendors/:id
//   GET  /jobs/:ref/sourcing                          -> in-house vs bought-out plan + suggested vendors
//   POST /pos            {jobRef?, vendorId, lines:[{description,qty,rate}], terms?, notes?}
//   POST /pos/from-job/:jobRef  {vendorId}            -> draft PO of the bought-out stages that vendor can do
//   GET  /pos/:ref · GET /pos [?jobRef=] · POST /pos/:ref/status {status}
//   GET  /                                            -> vendor + PO admin board
//
// Env: PORT (8805) · VENDOR_DATA_DIR · PRODUCTION_DATA_DIR (to read jobs) · SOURCING_RULES
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { store as production } from '../production-service/store.mjs';
import { store, nowISO } from './store.mjs';
import { sourcingPlan, classifyStage, loadRules } from './sourcing.mjs';

const PORT = Number(process.env.PORT || 8805);
const PO_FLOW = { draft: ['issued', 'cancelled'], issued: ['received', 'cancelled'], received: ['closed'], closed: [], cancelled: [] };

const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(b); };
const html = (res, code, s) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(s); };
const body = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => ok(d)); req.on('error', no); });

store.seedIfEmpty();
const activeVendorsFor = (cap) => store.listVendors({ capability: cap }).filter((v) => v.active !== false);

function priceLines(lines, discountPct) {
  const clean = (lines || []).map((l) => ({ description: String(l.description || '').slice(0, 200), qty: Number(l.qty) || 0, rate: Number(l.rate) || 0, capability: l.capability || null, amount: Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0)) }));
  const subtotal = clean.reduce((s, l) => s + l.amount, 0);
  const discAmount = Math.round(subtotal * (Number(discountPct) || 0) / 100);
  return { lines: clean, subtotal, discountPct: Number(discountPct) || 0, discountAmount: discAmount, total: subtotal - discAmount };
}

function createPO({ jobRef, vendorId, lines, terms, notes, discountPct }) {
  const vendor = store.getVendor(vendorId);
  if (!vendor) return { error: 400, msg: 'unknown vendorId' };
  if (jobRef && !production.getJob(jobRef)) return { error: 400, msg: 'unknown jobRef' };
  const priced = priceLines(lines, discountPct != null ? discountPct : vendor.discountPct);
  const ref = 'PO-' + randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  const po = store.createPO({
    ref, jobRef: jobRef || null, vendorId, vendorName: vendor.name, vendorType: vendor.type,
    created_at: nowISO(), status: 'draft', currency: 'INR',
    terms: terms || vendor.paymentTerms || 'COD', notes: notes || null, ...priced,
  });
  return { po };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const path = u.pathname;
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'OPTIONS') return json(res, 204, {});

    if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, vendors: store.listVendors().length, pos: store.listPOs({ limit: 1e9 }).length });
    if (req.method === 'GET' && path === '/') return html(res, 200, boardPage());

    // ---- vendors ----
    if (req.method === 'GET' && path === '/vendors') return json(res, 200, store.listVendors({ capability: u.searchParams.get('capability') || undefined, type: u.searchParams.get('type') || undefined }));
    if (req.method === 'GET' && seg[0] === 'vendors' && seg.length === 2) { const v = store.getVendor(seg[1]); return v ? json(res, 200, v) : json(res, 404, { error: 'vendor not found' }); }
    if (req.method === 'POST' && path === '/vendors') { let i; try { i = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); } if (!i.name) return json(res, 400, { error: 'name required' }); return json(res, 201, store.createVendor(i)); }
    if (req.method === 'PUT' && seg[0] === 'vendors' && seg.length === 2) { let i; try { i = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); } const v = store.updateVendor(seg[1], i); return v ? json(res, 200, v) : json(res, 404, { error: 'vendor not found' }); }

    // ---- bought-out routing for a job ----
    if (req.method === 'GET' && seg[0] === 'jobs' && seg.length === 3 && seg[2] === 'sourcing') {
      const job = production.getJob(seg[1]);
      if (!job) return json(res, 404, { error: 'job not found (create it in the production service first)' });
      const plan = sourcingPlan(job.stages, activeVendorsFor);
      return json(res, 200, { jobRef: job.ref, product: job.product, quantity: job.quantity, ...plan });
    }

    // ---- purchase orders ----
    if (req.method === 'POST' && path === '/pos') {
      let i; try { i = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (!i.vendorId || !Array.isArray(i.lines) || !i.lines.length) return json(res, 400, { error: 'vendorId and non-empty lines[] required' });
      const r = createPO(i);
      return r.error ? json(res, r.error, { error: r.msg }) : json(res, 201, r.po);
    }
    // seed a draft PO from a job's bought-out stages that the chosen vendor can do
    if (req.method === 'POST' && seg[0] === 'pos' && seg[1] === 'from-job' && seg.length === 3) {
      let i; try { i = JSON.parse((await body(req)) || '{}'); } catch { i = {}; }
      const job = production.getJob(seg[2]);
      if (!job) return json(res, 404, { error: 'job not found' });
      const vendor = store.getVendor(i.vendorId);
      if (!vendor) return json(res, 400, { error: 'unknown vendorId' });
      const rules = loadRules();
      const lines = (job.stages || [])
        .map((s) => ({ stage: s.stage, ...classifyStage(s.stage, rules) }))
        .filter((s) => s.sourcing === 'bought-out' && (vendor.capabilities || []).includes(s.capability))
        .map((s) => ({ description: `${s.stage} — ${job.product} × ${job.quantity}`, qty: job.quantity, rate: 0, capability: s.capability }));
      if (!lines.length) return json(res, 422, { error: `no bought-out stages this vendor can do (${vendor.capabilities.join(', ')})` });
      const r = createPO({ jobRef: job.ref, vendorId: vendor.id, lines });
      return json(res, 201, { ...r.po, note: 'rates are 0 — set them, then issue the PO' });
    }
    if (req.method === 'GET' && path === '/pos') return json(res, 200, store.listPOs({ limit: Number(u.searchParams.get('limit')) || 100 }).filter((p) => !u.searchParams.get('jobRef') || p.jobRef === u.searchParams.get('jobRef')));
    if (req.method === 'GET' && seg[0] === 'pos' && seg.length === 2) { const p = store.getPO(seg[1]); return p ? json(res, 200, p) : json(res, 404, { error: 'PO not found' }); }
    if (req.method === 'POST' && seg[0] === 'pos' && seg.length === 3 && seg[2] === 'status') {
      let i; try { i = JSON.parse((await body(req)) || '{}'); } catch { i = {}; }
      const po = store.getPO(seg[1]);
      if (!po) return json(res, 404, { error: 'PO not found' });
      const next = i.status;
      if (!(PO_FLOW[po.status] || []).includes(next)) return json(res, 409, { error: `cannot go ${po.status} → ${next}. allowed: ${(PO_FLOW[po.status] || []).join(', ') || 'none'}` });
      return json(res, 200, store.updatePO(po.ref, { status: next }));
    }

    json(res, 404, { error: 'not found', see: 'GET /health' });
  } catch (e) { json(res, e.code || 500, { error: String(e.message || e) }); }
});

server.listen(PORT, () => console.log(`vendor-service on http://127.0.0.1:${PORT}  (vendor + PO board at /)`));

function boardPage() {
  return `<!doctype html><meta charset=utf-8><title>Vendors & POs</title>
<style>body{font:15px -apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#111827;margin:0}
.wrap{max-width:860px;margin:26px auto;padding:0 16px}h1{font-size:19px}h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0}.mut{color:#6b7280;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}
.tag{display:inline-block;background:#eef2ff;color:#3452b4;border-radius:5px;padding:1px 7px;font-size:11px;margin:1px}
input{padding:7px;border:1px solid #e5e7eb;border-radius:7px;font:inherit}button{background:#1f6feb;color:#fff;border:0;border-radius:7px;padding:7px 12px;font:inherit;cursor:pointer;font-size:13px}
.ih{color:#0f7b3f}.bo{color:#9a3412;font-weight:600}</style>
<div class=wrap><h1>Vendors &amp; purchase orders <span class=mut>— bought-out routing (B4/B5)</span></h1>
<div class=card><h3>Vendors</h3><div id=vend class=mut>Loading…</div></div>
<div class=card><h3>Job sourcing plan</h3><div>Job ref: <input id=job placeholder="JOB-…"/> <button onclick=plan()>Show plan</button></div><div id=plan class=mut style="margin-top:10px"></div></div>
<div class=card><h3>Purchase orders</h3><div id=pos class=mut>Loading…</div></div></div>
<script>
const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const inr=(n)=>'₹'+Math.round(n).toLocaleString('en-IN');
async function j(p,o){const r=await fetch(p,o);return r.json();}
async function loadVend(){const v=await j('/vendors');document.getElementById('vend').innerHTML='<table><thead><tr><th>Name</th><th>Type</th><th>Capabilities</th><th>Terms</th></tr></thead>'+
  v.map(x=>'<tr><td>'+esc(x.name)+'</td><td class=mut>'+esc(x.type)+'</td><td>'+(x.capabilities||[]).map(c=>'<span class=tag>'+esc(c)+'</span>').join('')+'</td><td class=mut>'+esc(x.paymentTerms||'')+'</td></tr>').join('')+'</table>';}
async function plan(){const ref=document.getElementById('job').value.trim();if(!ref)return;const p=await j('/jobs/'+ref+'/sourcing');
  if(p.error){document.getElementById('plan').innerHTML='<span class=bo>'+esc(p.error)+'</span>';return;}
  document.getElementById('plan').innerHTML='<div class=mut>'+esc(p.product)+' × '+p.quantity.toLocaleString('en-IN')+' — '+p.summary.inHouse+' in-house, '+p.summary.boughtOut+' bought-out</div>'+
    '<table><thead><tr><th>#</th><th>Stage</th><th>Sourcing</th><th>Suggested vendors</th></tr></thead>'+
    p.stages.map(s=>'<tr><td>'+(s.index+1)+'</td><td>'+esc(s.stage)+'</td><td class="'+(s.sourcing==='bought-out'?'bo':'ih')+'">'+s.sourcing+(s.capability?' ('+esc(s.capability)+')':'')+'</td><td class=mut>'+((s.suggestedVendors||[]).map(v=>esc(v.name)).join(', ')||(s.sourcing==='bought-out'?'— none with this capability —':''))+'</td></tr>').join('')+'</table>';}
async function loadPos(){const p=await j('/pos');document.getElementById('pos').innerHTML=p.length?'<table><thead><tr><th>PO</th><th>Vendor</th><th>Job</th><th>Total</th><th>Status</th><th>Terms</th></tr></thead>'+
  p.map(x=>'<tr><td>'+esc(x.ref)+'</td><td>'+esc(x.vendorName)+'</td><td class=mut>'+esc(x.jobRef||'—')+'</td><td>'+inr(x.total)+'</td><td>'+esc(x.status)+'</td><td class=mut>'+esc(x.terms)+'</td></tr>').join('')+'</table>':'No purchase orders yet.';}
loadVend();loadPos();
</script>`;
}
