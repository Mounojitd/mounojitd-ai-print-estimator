// Phase 1 smoke — proves the whole customer slice end to end, against a THROWAWAY quotes dir:
//   catalog → intake (brief → priced preview + detected spec) → save quote (token + delivery date)
//   → fetch by token (the shareable view) → confirm.
// It boots the real pricing-service (headless engine) and the quote-service, so the price is the
// validated engine's, not a stub. Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PRICING_PORT = 8796, QUOTE_PORT = 8797;
const qtmp = mkdtempSync(join(tmpdir(), 'quotes-'));

const pricing = spawn(process.execPath, [resolve(__dir, '../pricing-service/server.mjs')],
  { env: { ...process.env, PORT: String(PRICING_PORT), PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.js' }, stdio: ['ignore', 'pipe', 'inherit'] });
const quote = spawn(process.execPath, [resolve(__dir, 'server.mjs')],
  { env: { ...process.env, PORT: String(QUOTE_PORT), PRICING_URL: `http://127.0.0.1:${PRICING_PORT}`, QUOTE_DATA_DIR: qtmp }, stdio: ['ignore', 'pipe', 'inherit'] });

const waitFor = (proc, re) => new Promise((ok) => proc.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const base = `http://127.0.0.1:${QUOTE_PORT}`;
const get = async (p) => (await fetch(base + p)).json();
const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();

let pass = 0, total = 0;
const check = (n, ok, x = '') => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' → ' + x : ''}`); };
const BRIEF = 'A5 booklet 48 pages 130 gsm art paper 4 colour both sides perfect bound cover 300 gsm matt lam quantity 1000';

try {
  await Promise.all([waitFor(pricing, /rate cards rc-/), waitFor(quote, /quote-service on/)]);

  const cat = await get('/catalog');
  check('catalog lists products', Array.isArray(cat) && cat.length === 28, `${cat.length} products`);
  check('catalog carries family + engine key', cat.every((c) => c.family && c.engine_product_key), '');
  check('catalog carries a photo field (null until a real photo is added)', cat.every((c) => 'photo' in c), `${cat.filter((c) => c.photo).length}/28 have a photo`);

  // intake → priced preview (not saved), with detected spec
  const pv = await post('/intake', { brief: BRIEF });
  check('intake prices the brief', pv.price && pv.price.grand > 0, `${inr(pv.price.grand)} · ${pv.product}`);
  check('intake echoes a confirmable spec', pv.spec && pv.spec.pages === 48 && !!pv.spec.size, JSON.stringify(pv.spec));
  check('intake reports lead time', pv.leadTimeDays > 0, `${pv.leadTimeDays}d`);
  check('intake did NOT create a quote', (await get('/quotes')).length === 0, '');

  // unpriceable brief is refused honestly (not saved, clear reason)
  const bad = await post('/quotes', { brief: 'some flyers' });
  check('unpriceable spec is refused (422, with reason)', !!bad.error && !!bad.reason, bad.reason || '');
  check('refused spec was not saved', (await get('/quotes')).length === 0, '');

  // save a quote → token + delivery date, stamped with rate-card version
  const q = await post('/quotes', { brief: BRIEF, customer: { name: 'Anita', phone: '99999' }, asOf: '2026-07-25' });
  check('quote saved with share token', !!q.token && q.token.length === 12, q.token);
  check('quote priced = intake price', q.price.grand === pv.price.grand, `${inr(q.price.grand)}`);
  check('quote has a delivery date (working days after asOf)', /^\d{4}-\d{2}-\d{2}$/.test(q.deliveryDate) && q.deliveryDate > q.asOf, `${q.asOf} +${q.leadTimeDays}wd → ${q.deliveryDate}`);
  check('quote stamped with rate-card version', !!q.ratecardVersion, q.ratecardVersion);
  check('quote carries customer', q.customer && q.customer.name === 'Anita', '');

  // fetch the shareable quote by token
  const shared = await get('/quotes/' + q.token);
  check('quote fetchable by token (shareable)', shared.token === q.token && shared.price.grand === q.price.grand, '');
  check('unknown token 404s', !!(await get('/quotes/deadbeef0000')).error, '');

  // confirm (P1.7 handoff)
  const cf = await post('/quotes/' + q.token + '/confirm');
  check('quote can be confirmed', cf.status === 'confirmed', cf.status);

  console.log(`\n${pass}/${total} checks passed`);
  process.exitCode = pass === total ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  pricing.kill('SIGTERM'); quote.kill('SIGTERM');
}
function inr(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }
