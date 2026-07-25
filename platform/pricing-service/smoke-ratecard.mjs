// P0.4c smoke: proves the loop — edit a rate card → /reload → the quote actually changes, and the
// estimate is stamped with the rate-card version. Runs against a THROWAWAY copy of the rate-card data
// (DATA_DIR) so the committed seed stays pristine. Run: node smoke-ratecard.mjs
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'rc-price-'));
cpSync(resolve(__dir, '../api/data'), tmp, { recursive: true });
const cardsPath = join(tmp, 'rate_cards.json');

const PORT = 8792;
const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmp, PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.js' };
const srv = spawn(process.execPath, [resolve(__dir, 'server.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
const waitFor = (re) => new Promise((ok) => srv.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const post = async (p, body) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const BRIEF = 'rigid set up box top bottom 12 x 8 x 4 inch metallic paper silver foil quantity 150';

let pass = 0, total = 0;
const check = (n, ok, x = '') => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' → ' + x : ''}`); };

try {
  await waitFor(/rate cards rc-/);
  const before = await post('/estimate', { brief: BRIEF });
  check('baseline price (rigidbox @ 40% margin)', before.price && before.price.grand > 0, `₹${before.price.grand.toLocaleString('en-IN')} · ${before.ratecardVersion}`);

  // Admin edits the rate card: rigidbox margin 40% -> 60% (simulating a PUT to the catalog API on the shared store).
  const cards = JSON.parse(readFileSync(cardsPath, 'utf8'));
  const rb = cards.find(c => c.category === 'product_margin' && c.key === 'rigidbox');
  const oldV = rb.version; rb.values.margin_pct = 60; rb.version = oldV + 1;
  writeFileSync(cardsPath, JSON.stringify(cards, null, 1));

  const reload = await post('/reload');
  check('reload picks up new fingerprint', reload.ok && reload.ratecardVersion !== before.ratecardVersion, `${before.ratecardVersion} → ${reload.ratecardVersion}`);

  const after = await post('/estimate', { brief: BRIEF });
  const up = after.price.grand > before.price.grand;
  check('edit MOVES the price (40%→60% margin ⇒ higher)', up, `₹${before.price.grand.toLocaleString('en-IN')} → ₹${after.price.grand.toLocaleString('en-IN')}`);
  check('estimate stamped with rate-card version', after.ratecardVersion === reload.ratecardVersion, after.ratecardVersion);

  // sanity: 60/40 margin means grand scales ~ (1-0.40)/(1-0.60) on the margin'd base — should be a clear jump
  check('price jump is material (>15%)', (after.price.grand - before.price.grand) / before.price.grand > 0.15, `+${Math.round((after.price.grand/before.price.grand-1)*100)}%`);

  console.log(`\n${pass}/${total} checks passed`);
  process.exitCode = pass === total ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  srv.kill('SIGTERM');
}
