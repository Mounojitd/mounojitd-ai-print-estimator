// Repository over production jobs + actuals (Phase B2/B3). DEV store = JSON files; PROD = Postgres
// (schema.sql), same method surface. A job SNAPSHOTS the order's estimate + the engine's production
// traveller; its status is DERIVED from stage progress. Actuals (B3) are captured against the job and
// compared to the estimate — the variance is what feeds rate-card corrections (advisory, never auto-applied).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.PRODUCTION_DATA_DIR || resolve(__dir, 'data');
const F = { jobs: resolve(DATA, 'jobs.json') };
const load = () => (existsSync(F.jobs) ? JSON.parse(readFileSync(F.jobs, 'utf8')) : []);
const save = (v) => { if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true }); writeFileSync(F.jobs, JSON.stringify(v, null, 1)); };

export const store = {
  createJob(j) { const all = load(); const row = { id: all.length + 1, ...j }; all.push(row); save(all); return row; },
  getJob(ref) { return load().find((j) => j.ref === ref) || null; },
  getJobByOrder(orderRef) { return load().find((j) => j.orderRef === orderRef) || null; },
  updateJob(ref, patch) { const all = load(); const i = all.findIndex((j) => j.ref === ref); if (i < 0) return null; all[i] = { ...all[i], ...patch, updated_at: nowISO() }; save(all); return all[i]; },
  listJobs({ limit = 100 } = {}) { return load().slice(-limit).reverse(); },
  allJobs() { return load(); },
};

export function nowISO() { try { return new Date().toISOString(); } catch { return '2026-07-25T00:00:00Z'; } }

// A job's status is DERIVED from its stages (and whether actuals are in): the shop floor is the truth.
export function deriveStatus(job) {
  const st = job.stages || [];
  const done = st.filter((s) => s.status === 'done').length;
  if (job.actual) return 'closed';                       // actuals captured (B3) → job accounted for
  if (done === 0 && !st.some((s) => s.status === 'in_progress')) return 'not_started';
  if (done === st.length && st.length > 0) return 'completed';
  return 'in_production';
}

// Estimate-vs-actual variance for one job (B3). Positive = actual came in ABOVE the estimate (we under-quoted).
export function jobVariance(job) {
  if (!job.actual || !(job.estimateAmount > 0)) return null;
  const a = job.actual.amount;
  if (!(a > 0)) return null;
  const diff = a - job.estimateAmount;
  return { estimate: job.estimateAmount, actual: a, diff, pct: +(diff / job.estimateAmount * 100).toFixed(1),
           qtyOrdered: job.quantity, qtyActual: job.actual.quantity ?? null };
}
