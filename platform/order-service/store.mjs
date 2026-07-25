// Repository over orders + payments (Phase 1.7). DEV store = JSON files (no native deps);
// PROD target = Postgres (schema.sql), same method surface so swapping is a drop-in.
// An order SNAPSHOTS the quoted total — checkout NEVER re-prices, so the customer pays exactly what
// was quoted. Payments are recorded against the order; the order's status is DERIVED from them.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.ORDER_DATA_DIR || resolve(__dir, 'data');   // override for tests
const F = { orders: resolve(DATA, 'orders.json'), payments: resolve(DATA, 'payments.json') };
const load = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : []);
const save = (p, v) => { if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 1)); };

export const store = {
  // ---- orders ----
  createOrder(o) { const all = load(F.orders); const row = { id: all.length + 1, ...o }; all.push(row); save(F.orders, all); return row; },
  getOrder(ref) { return load(F.orders).find((o) => o.ref === ref) || null; },
  getOrderByQuote(token) { return load(F.orders).find((o) => o.quoteToken === token) || null; },
  updateOrder(ref, patch) { const all = load(F.orders); const i = all.findIndex((o) => o.ref === ref); if (i < 0) return null; all[i] = { ...all[i], ...patch, updated_at: nowISO() }; save(F.orders, all); return all[i]; },
  listOrders({ limit = 50 } = {}) { return load(F.orders).slice(-limit).reverse(); },

  // ---- payments ----
  createPayment(p) { const all = load(F.payments); const row = { id: all.length + 1, ...p }; all.push(row); save(F.payments, all); return row; },
  getPaymentByIntent(intentId) { return load(F.payments).find((p) => p.intentId === intentId) || null; },
  updatePayment(intentId, patch) { const all = load(F.payments); const i = all.findIndex((p) => p.intentId === intentId); if (i < 0) return null; all[i] = { ...all[i], ...patch }; save(F.payments, all); return all[i]; },
  paymentsForOrder(ref) { return load(F.payments).filter((p) => p.orderRef === ref); },
};

export function nowISO() { try { return new Date().toISOString(); } catch { return '2026-07-25T00:00:00Z'; } }

// Add N calendar days to a 'YYYY-MM-DD' date (used for credit terms: due = delivery + net days). Pure math.
export function addDays(asOf, days) {
  const [y, m, d] = asOf.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + (days || 0));
  return dt.toISOString().slice(0, 10);
}

// The order's status is DERIVED from its payments — the single source of truth is money received.
export function deriveStatus(order, payments) {
  const paid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  if (paid >= order.total) return 'settled';
  if (order.terms === 'credit') return 'on_credit';
  if (order.advanceAmount > 0 && paid >= order.advanceAmount) return 'awaiting_balance';
  return 'awaiting_advance';
}
