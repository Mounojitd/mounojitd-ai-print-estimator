-- Quote service (Phase 1) — Postgres schema for saved customer quotes.
-- The dev store (store.mjs) is a JSON file with this same shape; swap in a pg-backed store with the
-- same method surface for production. A quote SNAPSHOTS everything needed to reproduce and honour it:
-- the spec, the itemised price, the engine + rate-card versions, the lead time and the delivery date.

CREATE TABLE IF NOT EXISTS quote (
  id              BIGSERIAL PRIMARY KEY,
  token           TEXT NOT NULL UNIQUE,          -- opaque share token (URL-safe, ~12 chars)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'draft', -- draft | confirmed  (order & payment = P1.7)

  -- who it's for (nullable — anonymous quotes allowed)
  customer_name   TEXT,
  customer_phone  TEXT,
  customer_email  TEXT,

  -- the request
  brief           TEXT NOT NULL,                 -- the plain-language intake text
  product         TEXT NOT NULL,                 -- engine product key the estimate resolved to
  quantity        INTEGER NOT NULL,
  margin_pct      NUMERIC,                       -- explicit override, if any

  -- the answer (snapshot — never recomputed for a saved quote)
  spec            JSONB NOT NULL DEFAULT '{}',   -- detected size / gsm / pages / binding / lamination
  price           JSONB NOT NULL,                -- itemised: grand, unit, paper, printing, plates, coating, margin, gst, menuRate
  lead_time_days  INTEGER,
  as_of           DATE NOT NULL,                 -- date the lead time was counted from
  delivery_date   DATE,                          -- as_of + lead_time working days (skip Sundays)

  -- reproducibility (PLATFORM_PLAN §2/§5)
  ratecard_version TEXT,                         -- fingerprint from the pricing service
  engine_version   TEXT                          -- hash of the engine build (todo)
);

CREATE INDEX IF NOT EXISTS quote_created_idx ON quote (created_at DESC);
CREATE INDEX IF NOT EXISTS quote_customer_idx ON quote (customer_phone);
