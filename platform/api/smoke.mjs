// Smoke test for the catalog/rate-card API. Runs against a THROWAWAY copy of data/ (DATA_DIR) so the
// committed seed stays pristine. Verifies: health, templates, categories, get a rate card, edit it
// (version bump + history logged), and that the edit persisted. Run: node smoke.mjs
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'rc-'));
cpSync(resolve(__dir, 'data'), tmp, { recursive: true });

const PORT = 8791;
const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmp };
const srv = spawn(process.execPath, [resolve(__dir, 'server.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
const waitFor = (re) => new Promise((ok) => srv.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const get = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
const put = async (p, body) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

let pass = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' → ' + extra : ''}`); };

try {
  await waitFor(/on http/);
  const h = await get('/health');
  check('health', h.ok && h.templates === 28 && h.rateCards === 75, `${h.templates} templates, ${h.rateCards} rate cards`);

  const cats = await get('/rate-cards/categories');
  check('categories', cats.press_source === 6 && cats.binding === 14 && cats.product_margin === 28, JSON.stringify(cats));

  const tpl = await get('/templates?family=perpiece');
  check('templates filter (perpiece)', tpl.length >= 3 && tpl.every(t => t.family === 'perpiece'), tpl.map(t => t.key).join(','));

  const before = await get('/rate-cards/product_margin/rigidbox');
  check('get rate card (rigidbox margin)', before && before.values.margin_pct === 40, `v${before.version} margin ${before.values.margin_pct}%`);

  const upd = await put('/rate-cards/product_margin/rigidbox', { values: { margin_pct: 42 } });
  check('edit → version bump', upd.version === before.version + 1 && upd.values.margin_pct === 42, `v${before.version}→v${upd.version}, 42%`);

  const after = await get('/rate-cards/product_margin/rigidbox');
  check('edit persisted', after.values.margin_pct === 42, `now ${after.values.margin_pct}%`);

  const hist = await get('/rate-cards/product_margin/rigidbox/history');
  check('history logged (reproducible)', hist.length === 1 && hist[0].values.margin_pct === 40, `${hist.length} entry, old=${hist[0].values.margin_pct}%`);

  console.log(`\n${pass}/${total} checks passed`);
  process.exitCode = pass === total ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  srv.kill('SIGTERM');
}
