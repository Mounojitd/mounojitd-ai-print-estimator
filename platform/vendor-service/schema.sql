-- Vendor + purchase-order service (Phase B4/B5) — Postgres schema.
-- The dev store (store.mjs) is JSON files with this shape. Vendors seed from the synthetic vendors.seed.json;
-- the real Vendor Master is loaded locally (tools/import_vendors.py) and never committed. A PO snapshots its
-- lines + the vendor's terms; its status is a simple buyer-driven lifecycle.

CREATE TABLE IF NOT EXISTS vendor (
  id             TEXT PRIMARY KEY,               -- e.g. VEN001
  name           TEXT NOT NULL,
  type           TEXT,                           -- Paper Supplier | Material | Postpress | Printing | Digital | Transporter
  capabilities   TEXT[] NOT NULL DEFAULT '{}',   -- lamination, binding, diecut, largeformat, dispatch, …
  contact_person TEXT, contact_phone TEXT, contact_email TEXT,
  payment_terms  TEXT DEFAULT 'COD',
  discount_pct   NUMERIC DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS purchase_order (
  id            BIGSERIAL PRIMARY KEY,
  ref           TEXT NOT NULL UNIQUE,            -- e.g. PO-D0F9CCB9
  job_ref       TEXT,                            -- the production job this PO is for (nullable: ad-hoc buys)
  vendor_id     TEXT NOT NULL REFERENCES vendor(id),
  vendor_name   TEXT NOT NULL,                   -- snapshot
  vendor_type   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft → issued → received → closed  (or cancelled)
  currency      TEXT NOT NULL DEFAULT 'INR',
  terms         TEXT,                            -- snapshot of the vendor's payment terms at PO time
  notes         TEXT,
  subtotal      INTEGER NOT NULL DEFAULT 0,
  discount_pct  NUMERIC NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS po_line (
  id            BIGSERIAL PRIMARY KEY,
  po_ref        TEXT NOT NULL REFERENCES purchase_order(ref),
  description   TEXT NOT NULL,
  capability    TEXT,                            -- which bought-out capability this line covers
  qty           INTEGER NOT NULL DEFAULT 0,
  rate          NUMERIC NOT NULL DEFAULT 0,
  amount        INTEGER NOT NULL DEFAULT 0       -- qty × rate
);

CREATE INDEX IF NOT EXISTS po_job_idx ON purchase_order (job_ref);
CREATE INDEX IF NOT EXISTS po_vendor_idx ON purchase_order (vendor_id);

-- Bought-out routing (which stage is made in-house vs bought-out) is computed from data/sourcing_rules.json
-- against a job's traveller — it is a rules-driven view, not stored state.
