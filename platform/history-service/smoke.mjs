// Phase B1 smoke — history match over a SYNTHETIC fixture (fixtures/sample_jobs.jsonl; no real data), so
// the test never touches the confidential DB. Verifies: relevant recommendations come back, the suggested
// brief is feedable to /intake, product browse works, AND the confidentiality guarantees hold —
// no amount / currency / raw-text / client field ever appears in a response.
// Run: node smoke.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8804;
const env = { ...process.env, PORT: String(PORT), HISTORY_JOBS: resolve(__dir, 'fixtures', 'sample_jobs.jsonl') };
const srv = spawn(process.execPath, [resolve(__dir, 'server.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
const waitFor = (re) => new Promise((ok) => srv.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const base = `http://127.0.0.1:${PORT}`;
const get = async (p) => (await fetch(base + p)).json();
const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();

let pass = 0, total = 0;
const check = (n, ok, x = '') => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' → ' + x : ''}`); };

try {
  await waitFor(/history-service on/);

  const h = await get('/health');
  check('health: specs indexed', h.ok && h.indexedSpecs === 10, `${h.indexedSpecs} specs, ${h.productTypes} types`);

  // relevance: customer words reach the right past jobs
  const ann = await post('/search', { query: 'school annual report book' });
  check('finds the annual report', ann.recommendation && ann.recommendation.productType === 'Annual Report', ann.recommendation && ann.recommendation.productType);
  check('recommendation carries a usable spec', ann.recommendation.spec.paper && ann.recommendation.spec.binding, '');
  check('suggested brief is feedable to /intake', /annual report/.test(ann.recommendation.suggestedBrief) && /quantity \d/.test(ann.recommendation.suggestedBrief), ann.recommendation.suggestedBrief.slice(0, 70) + '…');

  const wed = await post('/search', { query: 'wedding invitation card' });
  check('finds the invite card', wed.recommendation && /Invite/.test(wed.recommendation.productType), wed.recommendation && wed.recommendation.productType);
  const box = await post('/search', { query: 'packaging carton box' });
  check('finds the box', box.recommendation && box.recommendation.productType === 'Box', box.recommendation && box.recommendation.productType);

  // browse
  const prods = await get('/products');
  check('product browse (distinct types + counts)', Array.isArray(prods) && prods.length === 10 && prods.every((p) => p.count >= 1), `${prods.length} types`);

  // gibberish → honest empty, not a wrong recommendation
  const none = await post('/search', { query: 'zxqw flibber' });
  check('no false match on gibberish', none.count === 0 && none.recommendation === null, '');

  // ---- CONFIDENTIALITY: nothing sensitive may appear in ANY response ----
  const probes = ['bag', 'standee banner', 'annual report', 'box', 'card', 'sticker', 'calendar', 'letterhead'];
  let moneyLeak = 0, textLeak = 0, clientLeak = 0;
  for (const q of probes) {
    const blob = JSON.stringify(await post('/search', { query: q }));
    if (/(?:₹|\brs\.?\b|\binr\b|\/-|\brupees?\b)/i.test(blob)) { moneyLeak++; console.log('  ✗ money leak on', q, blob.match(/.{0,20}(?:₹|rs\.?|inr|rupees?).{0,10}/i)); }
    if (/_text/.test(blob)) textLeak++;
    if (/greenfield|corporate company profile/i.test(blob)) clientLeak++;   // fixture "client-ish" tokens live only in _text
  }
  check('no currency/amount in any response (scrubbed)', moneyLeak === 0, `${moneyLeak} leaks`);
  check('private _text never surfaced', textLeak === 0, `${textLeak} leaks`);
  check('search-only text (names) never surfaced', clientLeak === 0, `${clientLeak} leaks`);

  // the "Rs. 4000" / "Rs 3500" embedded in fixture _text must not reach the bag/standee spec
  const bag = await post('/search', { query: 'paper bag' });
  check('embedded amount in source text does not surface', !/4000|3500/.test(JSON.stringify(bag)), '');

  console.log(`\n${pass}/${total} checks passed`);
  process.exitCode = pass === total ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  srv.kill('SIGTERM');
}
