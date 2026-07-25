// History-match service — Phase B1 of PLATFORM_PLAN.md §3.6. "Show me what we did for a school annual
// report" → recommend a CONFIGURED SOLUTION (spec + a ready-to-quote brief), matched over past jobs.
//
// Confidentiality is the whole point here (roadmap risk note + repo rule): the 341-job database is
// CONFIDENTIAL and stays server-side. This service is fed an ANONYMISED specs file (tools/export_history.py
// drops Amount / Client identity / raw messages) and, on top of that, scrubs any currency mention from
// everything it returns. It NEVER surfaces a historical price — it recommends the solution; the live engine
// (quote-service) prices it. History informs the spec; math decides the number.
//
//   GET  /health
//   POST /search      {query, limit?}   -> ranked anonymised matches + a headline recommendation
//   GET  /products                      -> distinct product types + counts (browse)
//   GET  /                              -> a small internal search page
//
// Env: PORT (8799) · HISTORY_JOBS (path to anonymised jobs.jsonl; default data/jobs.jsonl)
//      QUOTE_APP_URL (optional — link "Price this live" to the customer quote app)
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildIndex, search, productSummary } from './search.mjs';
import { store as catalog } from '../api/store.mjs';
import { servePhoto } from '../api/photos.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8799);
const JOBS = process.env.HISTORY_JOBS || resolve(__dir, 'data', 'jobs.jsonl');
const QUOTE_APP_URL = process.env.QUOTE_APP_URL || '';

// Map a recorded product type ("Book", "Table Calendar", "Visiting Card") to an engine product key, so a
// B1 match can show the same product photo as the showcase. Lenient: exact label/key, then a small alias set.
const PHOTO_ALIAS = { book: 'booklet', brochure: 'brochure_multi', 'table calendar': 'calendar_table', calendar: 'calendar_sheet', 'visiting card': 'card', 'id card': 'card', 'greeting / invite card': 'card', letterhead: 'insert', form: 'insert', box: 'carton_tuck', 'standee / banner / board': 'banner', sticker: 'insert', tag: 'pasted_tag' };
function keyForProductType(pt) {
  if (!pt) return null;
  const t = String(pt).toLowerCase().trim();
  const tpls = catalog.listTemplates();
  const byLabel = tpls.find((x) => x.label.toLowerCase() === t || x.engine_product_key === t);
  if (byLabel) return byLabel.engine_product_key;
  return PHOTO_ALIAS[t] || null;
}
function photoForType(pt) { const k = keyForProductType(pt); return k ? catalog.photoFor(k) : null; }

function loadJobs() {
  if (!existsSync(JOBS)) { console.warn(`history: no jobs file at ${JOBS} — run tools/export_history.py first. Serving 0 specs.`); return []; }
  return readFileSync(JOBS, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const docs = loadJobs();
const index = buildIndex(docs);

const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(b); };
const body = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => ok(d)); req.on('error', no); });

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const path = u.pathname;
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'OPTIONS') return json(res, 204, {});

    if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, indexedSpecs: docs.length, productTypes: productSummary(docs).length });
    if (req.method === 'GET' && seg[0] === 'photos' && seg.length === 2) return void servePhoto(res, seg[1]);
    if (req.method === 'GET' && path === '/products') return json(res, 200, productSummary(docs));

    if (req.method === 'POST' && path === '/search') {
      let input; try { input = JSON.parse((await body(req)) || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (!input.query || typeof input.query !== 'string') return json(res, 400, { error: 'query (string) is required' });
      const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 20);
      const matches = search(index, input.query, { limit }).map((m) => ({ ...m, photo: photoForType(m.productType) }));
      return json(res, 200, { query: input.query, count: matches.length, recommendation: matches[0] || null, matches });
    }

    if (req.method === 'GET' && path === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page()); }

    json(res, 404, { error: 'not found', see: 'GET /health' });
  } catch (e) { json(res, e.code || 500, { error: String(e.message || e) }); }
});

server.listen(PORT, () => console.log(`history-service on http://127.0.0.1:${PORT}  (${docs.length} anonymised specs indexed)`));

function page() {
  return `<!doctype html><meta charset=utf-8><title>History match</title>
<style>body{font:15px -apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#111827;margin:0}
.wrap{max-width:760px;margin:32px auto;padding:0 16px}h1{font-size:19px}.mut{color:#6b7280;font-size:13px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0}
input{width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font:inherit}
button{background:#1f6feb;color:#fff;border:0;border-radius:8px;padding:11px 16px;font:inherit;font-weight:600;cursor:pointer}
.pill{display:inline-block;background:#eef2ff;color:#3452b4;border-radius:6px;padding:2px 8px;font-size:12px;margin-right:6px}
.kv{font-size:14px} .kv b{color:#6b7280;font-weight:500} .brief{background:#f9fafb;border:1px dashed #d1d5db;border-radius:8px;padding:8px;font-size:13px;margin-top:8px}
a{color:#1f6feb}</style>
<div class=wrap>
  <h1>History match <span class=mut>— what have we made like this?</span></h1>
  <p class=mut>Internal tool. Recommends a configured solution from past jobs. Prices are NOT shown — recommend the spec, price it live in the estimator.</p>
  <div class=card><input id=q placeholder="e.g. school annual report book, wedding invitation card, paper carton box" onkeydown="if(event.key==='Enter')go()"/>
    <div style="margin-top:10px"><button onclick=go()>Search</button> <span id=msg class=mut></span></div></div>
  <div id=out></div>
</div>
<script>
const QUOTE_APP=${JSON.stringify(QUOTE_APP_URL)};
const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function go(){
  const query=document.getElementById('q').value.trim(); if(!query)return;
  document.getElementById('msg').textContent='Searching…';
  const r=await fetch('/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,limit:6})});
  const j=await r.json(); document.getElementById('msg').textContent='';
  if(!j.matches||!j.matches.length){document.getElementById('out').innerHTML='<div class=card>No close match. Try different words, or configure it fresh in the estimator.</div>';return;}
  document.getElementById('out').innerHTML=j.matches.map(m=>{
    const s=m.spec||{}; const kv=[['Size',s.size],['Extent',s.extent],['Paper',s.paper],['Printing',s.printing],['Finishing',s.coating||s.binding],['Typical qty',s.typicalQuantity]]
      .filter(x=>x[1]).map(x=>'<span class=kv><b>'+x[0]+':</b> '+esc(x[1])+'</span>').join(' · ');
    const link=QUOTE_APP?' &nbsp; <a href="'+esc(QUOTE_APP)+'/?brief='+encodeURIComponent(m.suggestedBrief)+'" target=_blank>Price this live →</a>':'';
    const img=m.photo?'<img src="'+esc(m.photo)+'" alt="'+esc(m.productType||'')+'" onerror="this.style.display=\\'none\\'" style="width:100%;max-height:150px;object-fit:cover;border-radius:8px;margin-bottom:8px;background:#f1f5f9"/>':'';
    return '<div class=card>'+img+'<span class=pill>'+esc(m.productType||'?')+'</span><span class=mut>match '+m.score+'</span>'+
      '<div style="margin-top:8px">'+kv+'</div>'+
      '<div class=brief>'+esc(m.suggestedBrief)+'</div>'+
      '<div style="margin-top:6px" class=mut>Use this as a starting brief'+link+'</div></div>';
  }).join('');
}
</script>`;
}
