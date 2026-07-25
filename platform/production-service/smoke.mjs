// Phase B2/B3 smoke — the production + actuals slice end to end across all services, throwaway data dirs.
// Boots pricing + quote + order + production, then:
//   quote → pay order → create JOB (traveller from the engine) → advance every stage → completed
//   → record ACTUAL → closed + variance; and B3: several closed jobs of one product with actuals over the
//   estimate produce an actionable rate-card SUGGESTION. Plus guards: no job before advance is paid.
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PR = 8811, QU = 8812, OR = 8813, PD = 8814;
const qtmp = mkdtempSync(join(tmpdir(), 'q-')), otmp = mkdtempSync(join(tmpdir(), 'o-')), ptmp = mkdtempSync(join(tmpdir(), 'p-'));
const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.js';

const pricing = spawn(process.execPath, [resolve(__dir, '../pricing-service/server.mjs')], { env: { ...process.env, PORT: String(PR), PLAYWRIGHT_MODULE: PW }, stdio: ['ignore', 'pipe', 'inherit'] });
const quote = spawn(process.execPath, [resolve(__dir, '../quote-service/server.mjs')], { env: { ...process.env, PORT: String(QU), PRICING_URL: `http://127.0.0.1:${PR}`, QUOTE_DATA_DIR: qtmp }, stdio: ['ignore', 'pipe', 'inherit'] });
const order = spawn(process.execPath, [resolve(__dir, '../order-service/server.mjs')], { env: { ...process.env, PORT: String(OR), QUOTE_DATA_DIR: qtmp, ORDER_DATA_DIR: otmp }, stdio: ['ignore', 'pipe', 'inherit'] });
const prod = spawn(process.execPath, [resolve(__dir, 'server.mjs')], { env: { ...process.env, PORT: String(PD), QUOTE_DATA_DIR: qtmp, ORDER_DATA_DIR: otmp, PRODUCTION_DATA_DIR: ptmp }, stdio: ['ignore', 'pipe', 'inherit'] });

const waitFor = (p, re) => new Promise((ok) => p.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const Q = `http://127.0.0.1:${QU}`, O = `http://127.0.0.1:${OR}`, P = `http://127.0.0.1:${PD}`;
const post = async (b, p, x) => (await fetch(b + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: x ? JSON.stringify(x) : undefined })).json();
const get = async (b, p) => (await fetch(b + p)).json();

let pass = 0, total = 0;
const check = (n, ok, x = '') => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' → ' + x : ''}`); };
const BRIEF = 'A5 booklet 48 pages 130 gsm art paper 4 colour both sides perfect bound cover 300 gsm matt lam quantity 1000';

// helper: quote → order → pay advance, returns order ref
async function paidOrder(advancePct = 50) {
  const q = await post(Q, '/quotes', { brief: BRIEF, asOf: '2026-07-25' });
  const o = await post(O, '/orders', { quoteToken: q.token, advancePct });
  const pay = await post(O, `/orders/${o.ref}/pay`, { portion: 'advance' });
  await post(O, pay.payUrl + '/complete');
  return o;
}

try {
  await Promise.all([waitFor(pricing, /rate cards rc-/), waitFor(quote, /quote-service on/), waitFor(order, /order-service on/), waitFor(prod, /production-service on/)]);

  // guard: cannot start production before advance is paid
  const q0 = await post(Q, '/quotes', { brief: BRIEF, asOf: '2026-07-25' });
  const o0 = await post(O, '/orders', { quoteToken: q0.token });
  check('job blocked until advance paid (409)', (await post(P, '/jobs', { orderRef: o0.ref })).error && !!(await post(P, '/jobs', { orderRef: o0.ref })).error, '');

  // B2: paid order → job with the engine's traveller
  const o1 = await paidOrder();
  const job = await post(P, '/jobs', { orderRef: o1.ref });
  check('job created from paid order', job.ref && job.ref.startsWith('JOB-'), job.ref);
  check('traveller came from the engine (has prepress + printing stages)', job.stages.length >= 4 && job.stages.some((s) => /pre-press/i.test(s.stage)) && job.stages.some((s) => /printing/i.test(s.stage)), `${job.stages.length} stages`);
  check('job carries the estimate', job.estimateAmount === o1.total, `est ${job.estimateAmount}`);
  check('starts not_started', job.status === 'not_started', job.status);
  check('re-POST idempotent (same job)', (await post(P, '/jobs', { orderRef: o1.ref })).ref === job.ref, '');

  // advance stages
  await post(P, `/jobs/${job.ref}/stages/0`, { status: 'in_progress', by: 'press' });
  const mid = await get(P, '/jobs/' + job.ref);
  check('advancing a stage → in_production', mid.status === 'in_production', mid.status);
  for (let i = 0; i < job.stages.length; i++) await post(P, `/jobs/${job.ref}/stages/${i}`, { status: 'done', by: 'floor' });
  const doneJob = await get(P, '/jobs/' + job.ref);
  check('all stages done → completed', doneJob.status === 'completed', doneJob.status);

  // B3: capture actual over the estimate → closed + variance
  const over = Math.round(o1.total * 1.2);
  const closed = await post(P, `/jobs/${job.ref}/actual`, { amount: over, quantity: 1000 });
  check('actual recorded → closed', closed.status === 'closed', closed.status);
  check('variance computed (actual vs estimate)', closed.variance && closed.variance.pct === 20, `+${closed.variance && closed.variance.pct}%`);

  // B3 feedback: a SECOND closed booklet job over estimate makes the suggestion actionable
  const o2 = await paidOrder();
  const job2 = await post(P, '/jobs', { orderRef: o2.ref });
  for (let i = 0; i < job2.stages.length; i++) await post(P, `/jobs/${job2.ref}/stages/${i}`, { status: 'done' });
  await post(P, `/jobs/${job2.ref}/actual`, { amount: Math.round(o2.total * 1.15) });
  const sug = await get(P, '/rate-suggestions');
  const bk = sug.find((s) => s.product === 'booklet');
  check('B3 rate suggestion is per-product', !!bk && bk.jobs === 2, bk && `${bk.jobs} jobs, median ${bk.medianVariancePct}%`);
  check('persistent under-quote → actionable RAISE suggestion', bk.actionable && /RAISING/.test(bk.suggestion), `median +${bk.medianVariancePct}%`);
  check('suggestion is advisory, not auto-applied (points to admin)', /rate-card admin/.test(bk.suggestion) && /reload/.test(bk.suggestion), '');

  console.log(`\n${pass}/${total} checks passed`);
  process.exitCode = pass === total ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  pricing.kill('SIGTERM'); quote.kill('SIGTERM'); order.kill('SIGTERM'); prod.kill('SIGTERM');
}
