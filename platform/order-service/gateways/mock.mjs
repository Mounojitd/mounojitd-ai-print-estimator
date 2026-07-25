// Mock payment gateway (dev/test). Implements the gateway INTERFACE that a real provider (Razorpay,
// PayU, Stripe) must satisfy, so swapping is a drop-in:
//
//   createIntent({ orderRef, portion, amount, currency }) -> { provider, intentId, status, payUrl }
//   verifyWebhook(rawBody, headers)                        -> { intentId, status }   // 'paid' | 'failed'
//
// The mock mints a fake intent and a local payUrl that the mock checkout page can "pay" (no real money,
// no network). A real provider would return the provider's hosted-checkout URL and verify a signed webhook.
import { randomUUID } from 'node:crypto';

export function createGateway() {
  return {
    name: 'mock',
    async createIntent({ orderRef, portion, amount, currency = 'INR' }) {
      const intentId = 'pi_mock_' + randomUUID().replace(/-/g, '').slice(0, 16);
      // payUrl is local (this service) — the mock checkout page drives it. Real providers return a hosted URL.
      return { provider: 'mock', intentId, status: 'created', amount, currency, orderRef, portion, payUrl: `/pay/${intentId}` };
    },
    // Mock "webhook": trust the posted body (no signature). Real providers verify an HMAC/signature here.
    verifyWebhook(rawBody) {
      let b; try { b = JSON.parse(rawBody || '{}'); } catch { b = {}; }
      return { intentId: b.intentId, status: b.status === 'paid' ? 'paid' : (b.status === 'failed' ? 'failed' : 'unknown') };
    },
  };
}
