# Order & payment service (Phase 1.7)

Turns a confirmed **quote** (P1) into an **order** with a payment schedule, and takes payment through a
**pluggable gateway**. This is `../../PLATFORM_PLAN.md` §3.5, built to the roadmap's risk note:
*advance/balance + credit terms from day one, not bolted on.*

```
confirmed quote → order (advance/balance | credit schedule) → pay (gateway) → advance_paid → settled
```

Two rules baked in:
- **Checkout never re-prices.** The order snapshots the *quoted* total, so the customer pays exactly
  what was quoted — the engine is not re-run at payment time.
- **Status is derived from money received.** `awaiting_advance → awaiting_balance → settled` (or
  `on_credit → settled`) is computed from the paid payments, never set by hand.

## Run

```bash
# needs the pricing-service + quote-service running and sharing the quote store (QUOTE_DATA_DIR).
node server.mjs                    # → http://127.0.0.1:8798  (checkout at /checkout/:token)

# full end-to-end smoke (boots all three services against throwaway dirs): 15/15
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs
```

To let the P1 customer app link straight to checkout, start the quote-service with
`ORDER_CHECKOUT_URL=http://127.0.0.1:8798` — its "Confirm & pay" button then points here.

## API

| Method | Path | |
|---|---|---|
| POST | `/orders` | `{quoteToken, advancePct?, terms?, creditNetDays?}` → order + schedule (idempotent per quote) |
| GET | `/orders/:ref` | order + payments + paid/outstanding |
| GET | `/orders` `[?limit=]` | recent orders |
| POST | `/orders/:ref/pay` | `{portion: advance\|balance\|full}` → payment intent + `payUrl` |
| POST | `/webhooks/:provider` | provider callback (verified per gateway) → marks paid |
| GET | `/checkout/:token` | customer checkout page for a quote |
| GET | `/pay/:intentId` · POST `/pay/:intentId/complete` | mock hosted checkout (dev only) |

## Pluggable gateway

The service only knows a two-method **interface** — it never names a vendor:

```js
createIntent({ orderRef, portion, amount, currency }) -> { provider, intentId, status, payUrl }
verifyWebhook(rawBody, headers)                        -> { intentId, status }   // 'paid' | 'failed'
```

`gateways/mock.mjs` implements it for dev (fake intent + a local pay page, no real money). To go live,
drop a `gateways/razorpay.mjs` (or `payu.mjs`) exporting `createGateway()` with the same interface and
register it in `gateways/index.mjs`; select it with `GATEWAY=razorpay`. Nothing else changes.

## Terms

- **Advance/balance** (default): `advancePct` (default 50%) splits the total; advance is due to start
  production, balance before dispatch.
- **Credit** (`terms: 'credit'`): no advance; a single invoice due `creditNetDays` after the delivery
  date (`dueDate`). For approved accounts — the account-approval gate itself is a later slice.

## Honest scope / next

- The mock gateway is dev-only; a real provider is unwritten on purpose (no live keys, and shipping
  untested provider code would be a fake tick). The seam is proven — the webhook path is exercised in
  the smoke with a real-provider-shaped callback.
- Invoicing/receipts (PDF), partial refunds, and the account-credit approval workflow are not in this
  slice. Production tracking against the order is Track B (B2/B3).
