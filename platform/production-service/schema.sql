-- Production + actuals service (Phase B2/B3) — Postgres schema.
-- The dev store (store.mjs) is a JSON file with this shape. A job SNAPSHOTS the order's estimate and the
-- engine's production traveller; job status is DERIVED from stage progress. Actuals (B3) are compared to the
-- estimate to produce advisory rate-card corrections — the correction itself is applied by a human in the
-- rate-card admin (P0.4b), never here.

CREATE TABLE IF NOT EXISTS production_job (
  id             BIGSERIAL PRIMARY KEY,
  ref            TEXT NOT NULL UNIQUE,            -- e.g. JOB-BA4CF2E3
  order_ref      TEXT NOT NULL UNIQUE,            -- one job per order
  quote_token    TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'not_started', -- not_started | in_production | completed | closed

  product        TEXT NOT NULL,
  quantity       INTEGER NOT NULL,
  estimate_amount INTEGER NOT NULL,               -- the quoted grand total (INR)
  currency       TEXT NOT NULL DEFAULT 'INR',
  customer_name  TEXT,
  spec           JSONB NOT NULL DEFAULT '{}',
  delivery_date  DATE,

  -- B2: the traveller (engine productionSteps) with per-stage QC + sign-off
  stages         JSONB NOT NULL DEFAULT '[]',     -- [{stage, qc, status, by, note, measured, at}]

  -- B3: actuals captured after the job ships
  actual         JSONB                            -- {amount, quantity, spoilage, note, at}  (null until closed)
);

CREATE INDEX IF NOT EXISTS production_job_status_idx ON production_job (status);
CREATE INDEX IF NOT EXISTS production_job_product_idx ON production_job (product);

-- B3 rate-correction signal is computed on the fly (estimate vs actual variance per product); if you want it
-- materialised, add a view:
--   CREATE VIEW product_variance AS
--   SELECT product, count(*) jobs,
--          percentile_cont(0.5) WITHIN GROUP (ORDER BY (actual->>'amount')::numeric / estimate_amount - 1) AS median_var
--   FROM production_job WHERE actual IS NOT NULL GROUP BY product;
