// Phase 1.7 smoke — the order & payment slice, end to end across all three services, against throwaway
// data dirs. Boots pricing-service (headless engine) + quote-service + order-service, then:
//   quote → create order (50% advance schedule) → pay advance (mock gateway) → order 'awaiting_balance'
//   → pay balance → order 'settled'; plus a CREDIT-terms order settled by a single payment; plus the
//   honesty guards (checkout honours the quoted total; double-payment refused).
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PRICING = 8801, QUOTE = 8802, ORDER = 8803;
const qtmp = mkdtempSync(join(tmpdir(), 'q-')), otmp = mkdtempSync(join(tmpdir(), 'o-'));
const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.js';

const pricing = spawn(process.execPath, [resolve(__dir, '../pricing-service/server.mjs')], { env: { ...process.env, PORT: String(PRICING), PLAYWRIGHT_MODULE: PW }, stdio: ['ignore', 'pipe', 'inherit'] });
const quote = spawn(process.execPath, [resolve(__dir, '../quote-service/server.mjs')], { env: { ...process.env, PORT: String(QUOTE), PRICING_URL: `http://127.0.0.1:${PRICING}`, QUOTE_DATA_DIR: qtmp }, stdio: ['ignore', 'pipe', 'inherit'] });
const order = spawn(process.execPath, [resolve(__dir, 'server.mjs')], { env: { ...process.env, PORT: String(ORDER), QUOTE_DATA_DIR: qtmp, ORDER_DATA_DIR: otmp }, stdio: ['ignore', 'pipe', 'inherit'] });

const waitFor = (proc, re) => new Promise((ok) => proc.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const Q = `http://127.0.0.1:${QUOTE}`, O = `http://127.0.0.1:${ORDER}`;
const post = async (base, p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();
const get = async (base, p) => (await fetch(base + p)).json();
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

let pass = 0, total = 0;
const check = (n, ok, x = '') => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' → ' + x : ''}`); };
const BRIEF = 'A5 booklet 48 pages 130 gsm art paper 4 colour both sides perfect bound cover 300 gsm matt lam quantity 1000';

async function newQuote() { return post(Q, '/quotes', { brief: BRIEF, customer: { name: 'Anita', phone: '99999' }, asOf: '2026-07-25' }); }

try {
  await Promise.all([waitFor(pricing, /rate cards rc-/), waitFor(quote, /quote-service on/), waitFor(order, /order-service on/)]);

  // ---- advance/balance path ----
  const q1 = await newQuote();
  const o1 = await post(O, '/orders', { quoteToken: q1.token });   // default 50% advance
  check('order created from quote', o1.ref && o1.ref.startsWith('ORD-'), o1.ref);
  check('order honours the QUOTED total (no re-price)', o1.total === q1.price.grand, `${inr(o1.total)} == quote ${inr(q1.price.grand)}`);
  check('advance/balance schedule (50/50)', o1.advanceAmount + o1.balanceAmount === o1.total && o1.advanceAmount === Math.round(o1.total / 2), `${inr(o1.advanceAmount)} + ${inr(o1.balanceAmount)}`);
  check('starts awaiting_advance', o1.status === 'awaiting_advance', o1.status);
  check('creating the order confirmed the quote', (await get(Q, '/quotes/' + q1.token)).status === 'confirmed', '');
  check('re-POST is idempotent (same ref)', (await post(O, '/orders', { quoteToken: q1.token })).ref === o1.ref, '');

  // pay advance via the (mock) gateway: get intent → simulate hosted-checkout "Pay now"
  const payA = await post(O, `/orders/${o1.ref}/pay`, { portion: 'advance' });
  check('advance payment intent created', payA.payUrl && payA.amount === o1.advanceAmount, `${payA.payUrl} for ${inr(payA.amount)}`);
  const doneA = await post(O, payA.payUrl + '/complete');   // mock "Pay now"
  check('paying advance → awaiting_balance', doneA.ok && doneA.order.status === 'awaiting_balance', doneA.order && doneA.order.status);
  check('double-paying advance is refused (409)', !!(await post(O, `/orders/${o1.ref}/pay`, { portion: 'advance' })).error, '');

  // pay balance
  const payB = await post(O, `/orders/${o1.ref}/pay`, { portion: 'balance' });
  const doneB = await post(O, payB.payUrl + '/complete');
  check('paying balance → settled', doneB.ok && doneB.order.status === 'settled', doneB.order && doneB.order.status);
  const view = await get(O, '/orders/' + o1.ref);
  check('order fully paid, nothing outstanding', view.paid === o1.total && view.outstanding === 0, `paid ${inr(view.paid)}, out ${inr(view.outstanding)}`);

  // ---- webhook path (real-provider shape) settles too ----
  const q2 = await newQuote();
  const o2 = await post(O, '/orders', { quoteToken: q2.token, advancePct: 100 });   // full advance
  const payF = await post(O, `/orders/${o2.ref}/pay`, { portion: 'advance' });
  const wh = await post(O, '/webhooks/mock', { intentId: payF.payment.intentId, status: 'paid' });
  check('provider webhook marks paid → settled', wh.ok && wh.order.status === 'settled', wh.order && wh.order.status);

  // ---- credit terms path ----
  const q3 = await newQuote();
  const o3 = await post(O, '/orders', { quoteToken: q3.token, terms: 'credit', creditNetDays: 30 });
  check('credit order: no advance, due after delivery', o3.terms === 'credit' && o3.advanceAmount === 0 && o3.status === 'on_credit' && o3.dueDate > o3.deliveryDate, `due ${o3.dueDate}`);
  const payC = await post(O, `/orders/${o3.ref}/pay`, {});   // portion auto = full for credit
  const doneC = await post(O, payC.payUrl + '/complete');
  check('credit order settles on single payment', doneC.ok && doneC.order.status === 'settled', doneC.order && doneC.order.status);

  // ---- guard: unknown quote ----
  check('unknown quote token 404s', (await post(O, '/orders', { quoteToken: 'nope' })).error === 'quote not found', '');

  console.log(`\n${pass}/${total} checks passed`);
  process.exitCode = pass === total ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  pricing.kill('SIGTERM'); quote.kill('SIGTERM'); order.kill('SIGTERM');
}
