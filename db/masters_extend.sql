-- ==========================================
-- MASTER EXTENSIONS  —  widen V1 masters to hold the real master workbooks
-- (Vendor / Paper / Process / Product / Transport / Material).
-- Run AFTER schema.sql.  Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- import_masters.py loads the clean per-master files in db/files/ into these.
-- ==========================================

-- ---- vendors: richer contact / commercial fields ----
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS phone_alt           VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pan                 VARCHAR(20);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_terms       VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS discount_pct        NUMERIC(6,2);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS min_delivery_charge NUMERIC(12,2);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS quality             VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS on_time_pct         NUMERIC(6,2);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS preferred           BOOLEAN;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS status              VARCHAR(50);

-- ---- paper_master: grade / brand / finish + ream pricing ----
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS paper_type      VARCHAR(100);
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS grade           VARCHAR(150);
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS brand           VARCHAR(100);
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS finish          VARCHAR(100);
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS colour          VARCHAR(50);
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS sq_metre        NUMERIC(12,4);
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS price_per_ream  NUMERIC(12,4);
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS sheets_per_ream INTEGER;
ALTER TABLE paper_master ADD COLUMN IF NOT EXISTS stock           VARCHAR(50);

-- ---- machine_master: nothing structural to add (Colours -> color_capability,
--       Speed -> machine_speed_iph, Size (in) -> max_length/width_mm) ----

-- ---- products: form factor / substrate / free-text gsm spec ----
ALTER TABLE products ADD COLUMN IF NOT EXISTS form_factor VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS paper_board VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gsm_spec    VARCHAR(255);

-- ---- transport_master: route + per-trip / per-pc rates ----
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS vendor_id     VARCHAR(20) REFERENCES vendors(vendor_id);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS vehicle       VARCHAR(100);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS origin        VARCHAR(255);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS destination   VARCHAR(255);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS customer      VARCHAR(255);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS job           VARCHAR(255);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS qty_pcs       NUMERIC(14,2);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS rate_per_trip NUMERIC(14,4);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS rate_per_pc   NUMERIC(14,6);
ALTER TABLE transport_master ADD COLUMN IF NOT EXISTS delivery      VARCHAR(50);

-- ---- new reference tables ----
CREATE TABLE IF NOT EXISTS paper_types (
    id              SERIAL PRIMARY KEY,
    paper_type      VARCHAR(100),
    brand           VARCHAR(150),
    standard_sizes  VARCHAR(255),
    gsm_range       VARCHAR(100),
    grain           VARCHAR(50),
    primary_uses    TEXT
);

CREATE TABLE IF NOT EXISTS materials_master (
    material_id   VARCHAR(20) PRIMARY KEY,
    vendor_id     VARCHAR(20) REFERENCES vendors(vendor_id),
    vendor_name   VARCHAR(255),
    category      VARCHAR(100),
    material_type VARCHAR(255),
    description   TEXT,
    size_l_in     NUMERIC(10,2),
    size_w_in     NUMERIC(10,2),
    unit          VARCHAR(50),
    rate_per_unit NUMERIC(14,4),
    moq           NUMERIC(14,2),
    lead_days     INTEGER,
    stock         VARCHAR(50)
);
CREATE INDEX IF NOT EXISTS idx_materials_vendor ON materials_master(vendor_id);
