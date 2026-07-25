// Phase-1 AI discovery smoke — the conversational turn end to end (pricing-service + quote-service + the
// optional history-service for samples). Verifies: intent classification, adaptive "ask only what's missing",
// the multi-turn accumulation that ends in a real estimate, custom mode, and the upload seam.
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke-discover.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PR = 8841, HI = 8842, QU = 8843;
const qtmp = mkdtempSync(join(tmpdir(), 'q-'));
const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.js';

const pricing = spawn(process.execPath, [resolve(__dir, '../pricing-service/server.mjs')], { env: { ...process.env, PORT: String(PR), PLAYWRIGHT_MODULE: PW }, stdio: ['ignore', 'pipe', 'inherit'] });
const history = spawn(process.execPath, [resolve(__dir, '../history-service/server.mjs')], { env: { ...process.env, PORT: String(HI), HISTORY_JOBS: resolve(__dir, '../history-service/fixtures/sample_jobs.jsonl') }, stdio: ['ignore', 'pipe', 'inherit'] });
const quote = spawn(process.execPath, [resolve(__dir, 'server.mjs')], { env: { ...process.env, PORT: String(QU), PRICING_URL: `http://127.0.0.1:${PR}`, HISTORY_URL: `http://127.0.0.1:${HI}`, QUOTE_DATA_DIR: qtmp }, stdio: ['ignore', 'pipe', 'inherit'] });

const waitFor = (p, re) => new Promise((ok) => p.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const Q = `http://127.0.0.1:${QU}`;
const disc = async (message, brief = '', product = null) => (await fetch(Q + '/discover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, brief, product }) })).json();

let pass = 0, total = 0;
const check = (n, ok, x = '') => { total++; if (ok) pass++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' → ' + x : ''}`); };

try {
  await Promise.all([waitFor(pricing, /rate cards rc-/), waitFor(history, /history-service on/), waitFor(quote, /quote-service on/)]);

  // 1) intent + adaptive: a bare "I need a brochure" is classified and asked only for what's missing
  const t1 = await disc('I need a brochure');
  check('classifies intent (brochure)', t1.mode === 'discover' && /brochure/i.test(t1.label || ''), t1.label);
  check('asks only for missing fields (not everything)', Array.isArray(t1.missing) && t1.missing.length >= 1 && !t1.estimate, (t1.missing || []).join(' | '));
  check('offers real work samples (from B1)', Array.isArray(t1.samples) && t1.samples.length >= 1, `${(t1.samples || []).length} samples`);

  // 2) accumulate the answer → a real instant estimate
  const t2 = await disc('A4, 8 pages, 130 gsm art, 4 color both sides, center stitch, 1000 pcs', t1.brief, t1.product);
  check('accumulates + prices (instant estimate)', t2.estimate && t2.estimate.price.grand > 0, t2.estimate && `₹${t2.estimate.price.grand.toLocaleString('en-IN')}`);
  check('estimate carries a breakdown + lead time', t2.estimate.price.printing >= 0 && t2.estimate.leadTimeDays > 0, `${t2.estimate.leadTimeDays}d`);

  // 3) unknown product → custom mode
  const c1 = await disc('I need something unusual for my shop');
  check('unknown → custom mode (asks what you need)', c1.mode === 'custom' && Array.isArray(c1.missing), c1.mode);

  // 4) "print this design" → upload seam (honest phase-2 stub)
  const u1 = await disc('I want to print this design');
  check('"print this" → upload seam (flagged, not faked)', u1.mode === 'upload' && !u1.estimate, u1.mode);

  // 5) a one-shot full brief prices immediately
  const f1 = await disc('premium visiting card 350 gsm art both side 4 color velvet lamination 1000 pcs');
  check('one-shot full brief → immediate estimate', f1.estimate && f1.estimate.price.grand > 0, f1.estimate && `₹${f1.estimate.price.grand.toLocaleString('en-IN')}`);

  console.log(`\n${pass}/${total} checks passed`);
  process.exitCode = pass === total ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  pricing.kill('SIGTERM'); history.kill('SIGTERM'); quote.kill('SIGTERM');
}
