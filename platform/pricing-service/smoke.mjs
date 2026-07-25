// Smoke test for the pricing service: starts the server in-process, hits /health and /estimate
// with a few known jobs, prints the itemised results. Run: node smoke.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8788;
const env = { ...process.env, PORT: String(PORT), PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.js' };
const srv = spawn(process.execPath, [resolve(__dir, 'server.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });

const waitFor = (re) => new Promise((ok) => srv.stdout.on('data', (d) => { process.stdout.write(d); if (re.test(String(d))) ok(); }));
const post = async (body) => (await fetch(`http://127.0.0.1:${PORT}/estimate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

try {
  await waitFor(/listening/);
  const health = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
  console.log('\n/health:', JSON.stringify(health));

  const jobs = [
    { name: 'visiting card 1000', body: { brief: 'visiting card 90x54 mm 300 gsm 4 color both side matt lamination quantity 1000' } },
    { name: 'A4 booklet 48pp',   body: { brief: 'A4 booklet cover + 48 pages 130 gsm art 4 color both side section sewn quantity 1000' } },
    { name: 'rigid box',         body: { brief: 'rigid set up box top bottom 12 x 8 x 4 inch metallic paper silver foil quantity 150' } },
    { name: 'lanyard',           body: { brief: 'lanyard 2 x 90 cm polyester 3 color quantity 500' } },
    { name: 'no-size (unpriceable)', body: { brief: 'letterhead 4 color quantity 1000' } },
  ];
  let pass = 0;
  for (const j of jobs) {
    const r = await post(j.body);
    const ok = j.name.includes('unpriceable') ? r.unpriceable === true : (r.price && r.price.grand > 0);
    if (ok) pass++;
    const money = r.price ? `₹${r.price.grand.toLocaleString('en-IN')} (${r.product}, ${r.quantity}pc, lead ${r.leadTimeDays}d)` : `unpriceable — ${r.reason}`;
    console.log(`${ok ? '✓' : '✗'} ${j.name.padEnd(22)} → ${money}`);
  }
  console.log(`\n${pass}/${jobs.length} smoke checks passed`);
  process.exitCode = pass === jobs.length ? 0 : 1;
} catch (e) {
  console.error('smoke failed:', e); process.exitCode = 1;
} finally {
  srv.kill('SIGTERM');
}
