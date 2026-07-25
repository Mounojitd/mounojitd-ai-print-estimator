-- Order & payment service (Phase 1.7) — Postgres schema.
-- The dev store (store.mjs) is JSON files with this same shape. An order SNAPSHOTS the quoted total so
-- checkout never re-prices; the order's status is DERIVED from its payments (money received is the truth).

CREATE TABLE IF NOT EXISTS "order" (
  id             BIGSERIAL PRIMARY KEY,
  ref            TEXT NOT NULL UNIQUE,           -- human-friendly, e.g. ORD-A30E07F8
  quote_token    TEXT NOT NULL UNIQUE,           -- one order per quote (idempotent create)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ,
  status         TEXT NOT NULL,                  -- awaiting_advance | awaiting_balance | settled | on_credit

  customer_name  TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  product        TEXT NOT NULL,
  quantity       INTEGER NOT NULL,

  total          INTEGER NOT NULL,               -- honours the quoted grand total (INR, rounded)
  currency       TEXT NOT NULL DEFAULT 'INR',

  -- payment terms (advance/balance OR credit) — first-class, per the roadmap risk note
  terms          TEXT NOT NULL DEFAULT 'advance',-- advance | credit
  advance_pct    NUMERIC NOT NULL DEFAULT 50,
  advance_amount INTEGER NOT NULL DEFAULT 0,
  balance_amount INTEGER NOT NULL DEFAULT 0,
  credit_net_days INTEGER,                        -- for terms='credit'
  delivery_date  DATE,
  due_date       DATE,                            -- credit: delivery + net days

  ratecard_version TEXT
);

CREATE TABLE IF NOT EXISTS payment (
  id          BIGSERIAL PRIMARY KEY,
  order_ref   TEXT NOT NULL REFERENCES "order"(ref),
  portion     TEXT NOT NULL,                      -- advance | balance | full
  amount      INTEGER NOT NULL,
  provider    TEXT NOT NULL,                      -- gateway name (mock | razorpay | payu | …)
  intent_id   TEXT NOT NULL UNIQUE,               -- provider payment-intent id
  status      TEXT NOT NULL DEFAULT 'created',    -- created | paid | failed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payment_order_idx ON payment (order_ref);
CREATE INDEX IF NOT EXISTS order_created_idx ON "order" (created_at DESC);
