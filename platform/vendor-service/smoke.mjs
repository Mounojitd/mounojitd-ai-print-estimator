// Phase B4/B5 smoke — vendors + bought-out routing + purchase orders, end to end across services, throwaway
// dirs. Boots pricing + quote + order + production + vendor, drives a job to exist, then:
//   list seeded vendors → job sourcing plan (in-house vs bought-out, with vendor suggestions) → seed a PO from
//   the job's bought-out stages → price + issue → receive → close; plus guards (bad vendor, illegal status jump).
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PR = 8821, QU = 8822, OR = 8823, PD = 8824, VE = 8825;
const qtmp = mkdtempSync(join(tmpdir(), 'q-')), otmp = mkdtempSync(join(tmpdir(), 'o-')), ptmp = mkdtempSync(join(tmpdir(), 'p-')), vtmp = mkdtempSync(join(tmpdir(), 'v-'));
const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.js';

const S = (rel, env) => spawn(process.execPath, [resolve(__dir, rel)], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
const pricing = S('../pricing-service/server.mjs', { PORT: String(PR), PLAYWRIGHT_MODULE: PW });
const quote = S('../quote-service/server.mjs', { PORT: String(QU), PRICING_URL: `http://127.0.0.1:${PR}`, QUOTE_DATA_DIR: qtmp });
const order = S('../order-service/server.mjs', { PORT: String(OR), QUOTE_DATA_DIR: qtmp, ORDER_DATA_DIR: otmp });
const prod = S('../production-service/server.mjs', { PORT: String(PD), QUOTE_DATA_DIR: qtmp, ORDER_DATA_DIR: otmp, PRODUCTION_DATA_DIR: ptmp });
const vend = S('server.mjs', { PORT: String(VE), PRODUCTION_DATA_DIR: ptmp, VENDOR_DATA_DIR: vtmp });

const waitFor = (p, re) => new Promise((ok) => p.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const Q = `http://127.0.0.1:${QU}`, O = `http://127.0.0.1:${OR}`, P = `http://127.0.0.1:${PD}`, V = `http://127.0.0.1:${VE}`;
const post = async (b, p, x) => (await fetch(b + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: x ? JSON.stringify(x) : undefined })).json();
const get = async (b, p) => (await fetch(b + p)).json();

let pass = 0, total = 0;
const check = (n, ok, x = '') => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' → ' + x : ''}`); };
const BRIEF = 'A5 booklet 48 pages 130 gsm art paper 4 colour both sides perfect bound cover 300 gsm matt lam quantity 1000';

async function makeJob() {
  const q = await post(Q, '/quotes', { brief: BRIEF, asOf: '2026-07-25' });
  const o = await post(O, '/orders', { quoteToken: q.token });
  const pay = await post(O, `/orders/${o.ref}/pay`, { portion: 'advance' });
  await post(O, pay.payUrl + '/complete');
  return post(P, '/jobs', { orderRef: o.ref });
}

try {
  await Promise.all([waitFor(pricing, /rate cards rc-/), waitFor(quote, /quote-service on/), waitFor(order, /order-service on/), waitFor(prod, /production-service on/), waitFor(vend, /vendor-service on/)]);

  // vendors seeded
  const vendors = await get(V, '/vendors');
  check('vendors seeded (synthetic master)', Array.isArray(vendors) && vendors.length >= 6, `${vendors.length} vendors`);
  const postpress = await get(V, '/vendors?capability=lamination');
  check('filter vendors by capability', postpress.length >= 1 && postpress.every((v) => v.capabilities.includes('lamination')), `${postpress.length} can laminate`);

  // a real job with the engine traveller
  const job = await makeJob();
  check('job exists with traveller stages', job.ref && job.stages.length >= 4, `${job.stages.length} stages`);

  // B4: sourcing plan
  const plan = await get(V, `/jobs/${job.ref}/sourcing`);
  check('sourcing plan classifies every stage', plan.stages.length === job.stages.length && plan.stages.every((s) => ['in-house', 'bought-out'].includes(s.sourcing)), `${plan.summary.inHouse} in-house / ${plan.summary.boughtOut} bought-out`);
  check('printing/cutting kept in-house', plan.stages.some((s) => /printing/i.test(s.stage) && s.sourcing === 'in-house'), '');
  check('lamination + binding routed bought-out', plan.stages.some((s) => /lamination|coating/i.test(s.stage) && s.sourcing === 'bought-out') && plan.stages.some((s) => /binding|perfect|sewing|fold/i.test(s.stage) && s.sourcing === 'bought-out'), '');
  const boSt = plan.stages.find((s) => s.sourcing === 'bought-out' && s.suggestedVendors);
  check('bought-out stages suggest capable vendors', boSt && boSt.suggestedVendors.length >= 1, boSt && boSt.suggestedVendors.map((v) => v.name).join(', '));

  // B5: seed a PO from the job's bought-out stages for the postpress vendor
  const pp = postpress[0];
  const draft = await post(V, `/pos/from-job/${job.ref}`, { vendorId: pp.id });
  check('PO seeded from job bought-out stages', draft.ref && draft.ref.startsWith('PO-') && draft.lines.length >= 1, `${draft.ref}, ${draft.lines.length} lines`);
  check('PO carries vendor terms', draft.terms === pp.paymentTerms, draft.terms);
  check('PO starts draft with rates 0', draft.status === 'draft' && draft.total === 0, '');

  // price the PO (set rates) via a fresh PO, then run the lifecycle
  const priced = await post(V, '/pos', { jobRef: job.ref, vendorId: pp.id, lines: [{ description: 'Lamination — booklet cover', qty: 1000, rate: 2 }, { description: 'Perfect binding', qty: 1000, rate: 6 }] });
  check('PO totals computed (qty×rate, vendor discount)', priced.subtotal === 8000 && priced.total === 8000 - Math.round(8000 * pp.discountPct / 100), `sub ${priced.subtotal}, total ${priced.total}`);

  // lifecycle: draft → issued → received → closed
  const issued = await post(V, `/pos/${priced.ref}/status`, { status: 'issued' });
  check('PO draft → issued', issued.status === 'issued', '');
  check('illegal jump issued → closed refused (409)', !!(await post(V, `/pos/${priced.ref}/status`, { status: 'closed' })).error, '');
  await post(V, `/pos/${priced.ref}/status`, { status: 'received' });
  const closed = await post(V, `/pos/${priced.ref}/status`, { status: 'closed' });
  check('PO received → closed', closed.status === 'closed', '');

  // guards
  check('PO to unknown vendor refused', !!(await post(V, '/pos', { vendorId: 'NOPE', lines: [{ description: 'x', qty: 1, rate: 1 }] })).error, '');
  check('POs listable by job', (await get(V, `/pos?jobRef=${job.ref}`)).length >= 2, '');

  console.log(`\n${pass}/${total} checks passed`);
  process.exitCode = pass === total ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  [pricing, quote, order, prod, vend].forEach((p) => p.kill('SIGTERM'));
}
