// RECONCILE HARNESS (NKK sir 2026-07-21) — back-test the estimator against real quotes offline.
//
// Loads paper_calculator.html in headless Chromium, runs each job in db/real_quotes/test_jobs.csv
// through the SAME reset → applyVoiceSpec → run → combinedPrice sequence the in-app diagnostic sweep
// uses, and prints a component-wise gap table (Est vs NK sir's confirmed price). No Google Sheet /
// network needed — uses the estimator's built-in rate fallbacks, so it works in a fresh clone.
//
// Usage:  node tools/reconcile.mjs [path/to/jobs.csv]
// Needs Playwright + Chromium. In the Claude Code web env both are preinstalled; this script resolves
// the global Playwright automatically. Locally: `npm i -D playwright && npx playwright install chromium`.

import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import path from 'path';

// resolve playwright from cwd first, then the global node_modules (web env)
async function loadChromium(){
  const req = createRequire(import.meta.url);
  for(const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']){
    try{ const p = req(spec); if(p&&p.chromium) return p.chromium; }catch(e){}
  }
  try{ const m = await import('playwright'); if(m.chromium) return m.chromium; }catch(e){}
  throw new Error('Playwright not found. Install with: npm i -D playwright && npx playwright install chromium');
}

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CSV = process.argv[2] || `${REPO}/db/real_quotes/test_jobs.csv`;

function parseCSV(text){
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=c; }
    else { if(c==='"') q=true; else if(c===','){ row.push(cell); cell=''; }
      else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
      else if(c==='\r'){} else cell+=c; } }
  if(cell.length||row.length){ row.push(cell); rows.push(row); }
  return rows;
}

const rows = parseCSV(readFileSync(CSV,'utf8')).filter(r=>r.some(c=>String(c||'').trim()!==''));
const head = rows[0]; const idx = n=>head.indexOf(n);
const jobs = rows.slice(1).map(r=>({
  job_id:r[idx('job_id')], client:r[idx('client')], spec:r[idx('spec')],
  qty:parseInt(String(r[idx('qty')]||'').replace(/[^0-9]/g,''))||0,
  nk:parseFloat(String(r[idx('nk_price')]||'').replace(/[^0-9.]/g,''))||0,
}));

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors=[]; page.on('pageerror', e=>pageErrors.push(String(e)));
await page.goto(pathToFileURL(`${REPO}/paper_calculator.html`).href, {waitUntil:'load'});
await page.waitForTimeout(1500);

const results = [];
for(const j of jobs){
  const out = await page.evaluate((job)=>{
    const $=id=>document.getElementById(id);
    try{
      window.marginEdited=false; window.gangedEdited=false; window.flatRateEdited=false; window.bindingEdited=false;
      if(window.MACHINE_MODE!=null) window.MACHINE_MODE="auto";
      if(window.COVER_MACHINE_MODE!=null) window.COVER_MACHINE_MODE="auto";
      ["coverEmb1","coverEmb2","coverEmb3","flatEmb1","flatEmb2","flatEmb3"].forEach(id=>{const el=$(id); if(el) el.value="none";});
      if($("lam")) $("lam").value="none";
      if($("coverLam")) $("coverLam").value="none";
      if($("reprint")) $("reprint").checked=false;
      if($("ganged")) $("ganged").checked=false;
      ["fppDie","fppPunch","fppFold","fppScore","ptagPaste"].forEach(id=>{ if($(id)) $(id).value=0; });
      if($("flatRatePc")) $("flatRatePc").value="";
      if($("extentFlat")) $("extentFlat").value=1;
      if($("voiceText")) $("voiceText").value=job.spec;
      applyVoiceSpec(job.spec);
      if(job.qty>0){ if($("copies2")) $("copies2").value=job.qty; if($("copies")) $("copies").value=job.qty; }
      applyGangedDefault(); applyMenuRateHint();
      run();
      const x = combinedPrice(); const q=x.q, t=x.text, cq=x.cover;
      return { ok:true, product:$("product")?$("product").value:"", est:Math.round(q.grand||0),
        paper:Math.round(q.paper||0),
        print:Math.round((t&&t.printing)||0)+Math.round((cq&&cq.printing)||0),
        plate:Math.round((t&&t.plates)||0)+Math.round((cq&&cq.plates)||0),
        coat:Math.round((t&&t.lam)||0)+Math.round((cq&&cq.lam)||0), emb:Math.round(x.embTotal||0),
        bind:Math.round(x.binding||0)+Math.round((x.mech&&x.mech.total)||0),
        pp:Math.round((x.flatpp&&x.flatpp.total)||0)+Math.round((x.ptag&&x.ptag.total)||0)+Math.round((x.tablecal&&x.tablecal.total)||0)+Math.round((x.wallcal&&x.wallcal.total)||0),
        pack:Math.round((q.packing||0)+(q.freight||0)), mgn:Math.round(q.margin||0),
        ganged:$("ganged")&&$("ganged").checked?"Y":"" };
    }catch(e){ return {ok:false, err:String(e).slice(0,200)}; }
  }, j);
  const gap = (out.ok && j.nk>0) ? Math.round((out.est-j.nk)/j.nk*100) : null;
  results.push({...j, ...out, gap});
}
await browser.close();

const inr=n=>n==null?'':'₹'+Number(n).toLocaleString('en-IN');
const pad=(s,n)=>String(s==null?'':s).padEnd(n).slice(0,n);
const padr=(s,n)=>String(s==null?'':s).padStart(n);
console.log(`\n=== RECONCILE: ${path.basename(CSV)} (${jobs.length} jobs, built-in rates, offline) ===\n`);
console.log(pad('job_id',22),pad('product',12),padr('qty',6),padr('NK',9),padr('Est',9),padr('gap%',6),pad(' gang',5),' paper/print/plate/coat/emb/bind/pp/pack/mgn');
let g15=0,g30=0,over=0;
for(const r of results){
  if(!r.ok){ console.log(pad(r.job_id,22),'ERROR:',r.err); continue; }
  const a=Math.abs(r.gap); if(a<15)g15++; else if(a<30)g30++; else over++;
  const comps=`${r.paper}/${r.print}/${r.plate}/${r.coat}/${r.emb}/${r.bind}/${r.pp}/${r.pack}/${r.mgn}`;
  console.log(pad(r.job_id,22),pad(r.product,12),padr(r.qty,6),padr(inr(r.nk),9),padr(inr(r.est),9),padr((r.gap>=0?'+':'')+r.gap+'%',6),pad(' '+(r.ganged||'-'),5),' '+comps);
}
console.log(`\nBands: <15% = ${g15} · 15-30% = ${g30} · >30% = ${over} · errors = ${results.filter(r=>!r.ok).length}`);
if(pageErrors.length) console.log('Page errors:', pageErrors.slice(0,3));
