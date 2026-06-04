-- ==========================================
-- IMPORTED RATE MASTERS  (staging / source-of-record from Rate_Masters.xlsx)
-- ==========================================
-- These tables faithfully mirror the Excel rate-master workbook so nothing is
-- lost on import (multi-unit pricing, min charges, qty breaks, free-text sizes,
-- template text like "5% / 12%"). Vendors are auto-upserted into vendors() and
-- referenced by FK. The curated V1 masters in schema.sql remain the tables the
-- cost engine reads; these *_rates / *_master tables are the raw input you
-- curate from. Run AFTER schema.sql.
-- import_excel.py reloads (DELETE + insert) these on every run.

-- 1) Post-press: lamination / uv / foiling / embossing / die_cutting / binding
--    (all six sheets share one column template -> one table + discriminator)
CREATE TABLE IF NOT EXISTS postpress_rates (
    id                  SERIAL PRIMARY KEY,
    operation_category  VARCHAR(40) NOT NULL,      -- lamination|uv|foiling|embossing|die_cutting|binding
    vendor_id           VARCHAR(20) REFERENCES vendors(vendor_id),
    vendor_name         VARCHAR(255),
    operation_type      VARCHAR(255),
    job_ref             VARCHAR(255),
    pages               VARCHAR(100),
    qty                 NUMERIC(14,2),
    size_text           VARCHAR(100),
    pricing_unit        VARCHAR(100),
    rate_per_pcs        NUMERIC(14,4),
    rate_per_sheet      NUMERIC(14,4),
    rate_per_sqin       NUMERIC(14,6),
    min_charge          NUMERIC(14,2),
    qty_break_min       NUMERIC(14,2),
    qty_break_rate      NUMERIC(14,4),
    active              BOOLEAN DEFAULT TRUE,
    source_sheet        VARCHAR(100),
    source_row          INTEGER,
    imported_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_postpress_cat    ON postpress_rates(operation_category);
CREATE INDEX IF NOT EXISTS idx_postpress_vendor ON postpress_rates(vendor_id);

-- 2) Plate / CTP charges per colour by vendor & machine
CREATE TABLE IF NOT EXISTS plate_rates (
    id                  SERIAL PRIMARY KEY,
    vendor_id           VARCHAR(20) REFERENCES vendors(vendor_id),
    vendor_name         VARCHAR(255),
    machine             VARCHAR(255),
    machine_type        VARCHAR(100),
    max_sheet_size      VARCHAR(100),
    colours             VARCHAR(50),
    plate_charge_small  NUMERIC(14,2),
    plate_charge_big    NUMERIC(14,2),
    source_sheet        VARCHAR(100),
    source_row          INTEGER,
    imported_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plate_vendor ON plate_rates(vendor_id);

-- 3) Packaging materials (poly / pouch / box / carton)
CREATE TABLE IF NOT EXISTS packaging_rates (
    id                  SERIAL PRIMARY KEY,
    vendor_id           VARCHAR(20) REFERENCES vendors(vendor_id),
    vendor_name         VARCHAR(255),
    category            VARCHAR(100),
    material_type       VARCHAR(255),
    description         TEXT,
    size_l_in           NUMERIC(10,2),
    size_w_in           NUMERIC(10,2),
    unit                VARCHAR(50),
    rate_per_unit       NUMERIC(14,4),
    moq                 NUMERIC(14,2),
    lead_time_days      INTEGER,
    source_sheet        VARCHAR(100),
    source_row          INTEGER,
    imported_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_packaging_vendor ON packaging_rates(vendor_id);

-- 4) Rule templates  (values kept as TEXT because the sheet holds "3%",
--    "5% / 12%", "2 sheets" etc. — curate into the numeric V1 rule tables.)
CREATE TABLE IF NOT EXISTS wastage_rules_master (
    id            SERIAL PRIMARY KEY,
    process       VARCHAR(255),
    wastage_basis VARCHAR(255),
    wastage_value VARCHAR(100),
    notes         TEXT,
    source_sheet  VARCHAR(100),
    source_row    INTEGER,
    imported_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS margin_rules_master (
    id             SERIAL PRIMARY KEY,
    cost_component VARCHAR(255),
    margin_basis   VARCHAR(255),
    margin_value   VARCHAR(100),
    notes          TEXT,
    source_sheet   VARCHAR(100),
    source_row     INTEGER,
    imported_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gst_rules_master (
    id           SERIAL PRIMARY KEY,
    item_service VARCHAR(255),
    hsn_sac      VARCHAR(100),
    gst_value    VARCHAR(100),
    notes        TEXT,
    source_sheet VARCHAR(100),
    source_row   INTEGER,
    imported_at  TIMESTAMPTZ DEFAULT now()
);
