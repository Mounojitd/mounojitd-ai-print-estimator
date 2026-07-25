// One-process launcher for the whole platform — boots every service, wires them together, and exposes the
// AI discovery homepage (quote-service) on the public PORT. Used by the Docker image and for a local run.
//
//   PORT           public port for the AI homepage (default 8080)
//   DATA_ROOT      writable dir for quotes/orders/jobs/vendors (default ./.deploy-data; mount a volume to persist)
//   HISTORY_JOBS   path to the anonymised job specs for B1 samples (default: the committed SYNTHETIC fixture)
//   START_FULL=1   also boot order/production/vendor services (internal ports; not publicly exposed here)
//   PLAYWRIGHT_MODULE  optional explicit playwright path (in Docker, the installed dep resolves automatically)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = Number(process.env.PORT || 8080);
const DATA = process.env.DATA_ROOT || resolve(__dir, '..', '.deploy-data');
const FULL = process.env.START_FULL === '1';
mkdirSync(DATA, { recursive: true });

const IP = { pricing: 8787, history: 8799, order: 8798, production: 8800, vendor: 8805 };
const procs = [];
function start(name, rel, env, port) {
  const p = spawn(process.execPath, [resolve(__dir, rel)], { env: { ...process.env, ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  p.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  p.on('exit', (c) => console.error(`[${name}] exited (${c}) — the site may be degraded`));
  procs.push(p);
  return p;
}
const waitLog = (p, re) => new Promise((ok) => { const h = (d) => { if (re.test(String(d))) { p.stdout.off('data', h); ok(); } }; p.stdout.on('data', h); });

// engine (headless Chromium) + B1 samples
const pricing = start('pricing', 'pricing-service/server.mjs', {}, IP.pricing);
start('history', 'history-service/server.mjs', { HISTORY_JOBS: process.env.HISTORY_JOBS || resolve(__dir, 'history-service/fixtures/sample_jobs.jsonl') }, IP.history);

// optional downstream (internal only unless you put a proxy in front)
if (FULL) {
  start('order', 'order-service/server.mjs', { QUOTE_DATA_DIR: `${DATA}/quotes`, ORDER_DATA_DIR: `${DATA}/orders` }, IP.order);
  start('production', 'production-service/server.mjs', { QUOTE_DATA_DIR: `${DATA}/quotes`, ORDER_DATA_DIR: `${DATA}/orders`, PRODUCTION_DATA_DIR: `${DATA}/production` }, IP.production);
  start('vendor', 'vendor-service/server.mjs', { PRODUCTION_DATA_DIR: `${DATA}/production`, VENDOR_DATA_DIR: `${DATA}/vendors` }, IP.vendor);
}

console.log('booting the pricing engine (headless Chromium)…');
await waitLog(pricing, /listening on/);

// the public homepage — AI discovery + estimate + save-quote
start('quote', 'quote-service/server.mjs', {
  PRICING_URL: `http://127.0.0.1:${IP.pricing}`,
  HISTORY_URL: `http://127.0.0.1:${IP.history}`,
  QUOTE_DATA_DIR: `${DATA}/quotes`,
}, PUB);

console.log(`\n▶ AI Print platform up. Public homepage on port ${PUB}.`);
const shut = () => { procs.forEach((p) => { try { p.kill('SIGTERM'); } catch {} }); process.exit(0); };
process.on('SIGINT', shut); process.on('SIGTERM', shut);
