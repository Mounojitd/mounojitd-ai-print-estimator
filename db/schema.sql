-- ==========================================
-- AI PRINT ESTIMATOR DATABASE  —  Version 1
-- PostgreSQL 13+
-- ==========================================
-- Revisions vs. the original draft:
--   * gen_random_uuid() (pgcrypto) instead of legacy uuid-ossp
--   * TIMESTAMPTZ everywhere instead of naked TIMESTAMP
--   * quotation_items now stores the *selections* (FKs) used, not just costs,
--     so an estimate can be audited and regenerated
--   * effective-dating (valid_from / valid_to) on rate & cost masters so old
--     quotes don't silently change when rates are updated
--   * indexes on every foreign key
--   * CHECK constraints for data integrity (positive amounts, qty bands, %)
--   * ON DELETE CASCADE for quotation children
--   * status / job_status constrained to known values
--   * btree_gist exclusion constraint preventing overlapping qty rate bands
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- range exclusion constraints

-- ==========================================
-- VENDORS
-- ==========================================

CREATE TABLE vendors (
    vendor_id       VARCHAR(20) PRIMARY KEY,
    vendor_name     VARCHAR(255) NOT NULL,
    vendor_type     VARCHAR(100),
    contact_person  VARCHAR(255),
    phone           VARCHAR(50),
    email           VARCHAR(255),
    gst_number      VARCHAR(50),
    address         TEXT,
    lead_time_days  INTEGER DEFAULT 0 CHECK (lead_time_days >= 0),
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- PRODUCTS
-- ==========================================

CREATE TABLE products (
    product_id      VARCHAR(20) PRIMARY KEY,
    product_name    VARCHAR(255) NOT NULL,
    category        VARCHAR(100),
    description     TEXT,
    default_gsm     INTEGER CHECK (default_gsm IS NULL OR default_gsm > 0),
    default_binding VARCHAR(100),
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- PAPER MASTER
-- ==========================================

CREATE TABLE paper_master (
    paper_id        VARCHAR(20) PRIMARY KEY,
    paper_name      VARCHAR(255) NOT NULL,
    gsm             INTEGER CHECK (gsm IS NULL OR gsm > 0),
    sheet_length_mm NUMERIC(10,2) CHECK (sheet_length_mm IS NULL OR sheet_length_mm > 0),
    sheet_width_mm  NUMERIC(10,2) CHECK (sheet_width_mm  IS NULL OR sheet_width_mm  > 0),
    cost_per_sheet  NUMERIC(12,4) CHECK (cost_per_sheet IS NULL OR cost_per_sheet >= 0),
    cost_per_kg     NUMERIC(12,4) CHECK (cost_per_kg    IS NULL OR cost_per_kg    >= 0),
    vendor_id       VARCHAR(20) REFERENCES vendors(vendor_id),
    moq             INTEGER CHECK (moq IS NULL OR moq >= 0),
    valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to        DATE,
    active          BOOLEAN DEFAULT TRUE,
    CONSTRAINT chk_paper_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_paper_vendor ON paper_master(vendor_id);

-- ==========================================
-- MACHINE MASTER
-- ==========================================

CREATE TABLE machine_master (
    machine_id          VARCHAR(20) PRIMARY KEY,
    vendor_id           VARCHAR(20) REFERENCES vendors(vendor_id),
    machine_name        VARCHAR(255) NOT NULL,
    machine_type        VARCHAR(100),
    max_sheet_size_name VARCHAR(100),
    max_length_mm       NUMERIC(10,2) CHECK (max_length_mm IS NULL OR max_length_mm > 0),
    max_width_mm        NUMERIC(10,2) CHECK (max_width_mm  IS NULL OR max_width_mm  > 0),
    color_capability    VARCHAR(50),
    machine_speed_iph   INTEGER CHECK (machine_speed_iph IS NULL OR machine_speed_iph > 0),
    pricing_model       VARCHAR(100),
    lead_time_days      INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    active              BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_machine_vendor ON machine_master(vendor_id);

-- ==========================================
-- PRINT RATE MASTER
-- ==========================================

CREATE TABLE print_rate_master (
    rate_record_id              VARCHAR(20) PRIMARY KEY,
    machine_id                  VARCHAR(20) REFERENCES machine_master(machine_id),
    vendor_id                   VARCHAR(20) REFERENCES vendors(vendor_id),
    min_qty                     INTEGER NOT NULL CHECK (min_qty >= 0),
    max_qty                     INTEGER NOT NULL,
    rate_single_color           NUMERIC(12,4) CHECK (rate_single_color          IS NULL OR rate_single_color          >= 0),
    rate_4_color_big_machine    NUMERIC(12,4) CHECK (rate_4_color_big_machine   IS NULL OR rate_4_color_big_machine   >= 0),
    rate_4_color_small_machine  NUMERIC(12,4) CHECK (rate_4_color_small_machine IS NULL OR rate_4_color_small_machine >= 0),
    plate_charge_small          NUMERIC(12,4) CHECK (plate_charge_small IS NULL OR plate_charge_small >= 0),
    plate_charge_big            NUMERIC(12,4) CHECK (plate_charge_big   IS NULL OR plate_charge_big   >= 0),
    valid_from                  DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to                    DATE,
    active                      BOOLEAN DEFAULT TRUE,
    CONSTRAINT chk_rate_qty_band   CHECK (max_qty >= min_qty),
    CONSTRAINT chk_rate_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from),
    -- No two active rate bands for the same machine may overlap on quantity.
    CONSTRAINT excl_rate_band_overlap EXCLUDE USING gist (
        machine_id WITH =,
        int4range(min_qty, max_qty, '[]') WITH &&
    ) WHERE (active)
);
CREATE INDEX idx_print_machine ON print_rate_master(machine_id);
CREATE INDEX idx_print_vendor  ON print_rate_master(vendor_id);

-- ==========================================
-- FINISHING PROCESS MASTERS
-- rate_type drives how `rate` is interpreted by the cost engine:
--   'per_sheet' | 'per_unit' | 'flat'
-- ==========================================

CREATE TABLE lamination_master (
    lamination_id   VARCHAR(20) PRIMARY KEY,
    lamination_type VARCHAR(100) NOT NULL,
    rate_type       VARCHAR(50) CHECK (rate_type IN ('per_sheet','per_unit','flat')),
    rate            NUMERIC(12,4) CHECK (rate IS NULL OR rate >= 0),
    vendor_id       VARCHAR(20) REFERENCES vendors(vendor_id),
    active          BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_lamination_vendor ON lamination_master(vendor_id);

CREATE TABLE uv_master (
    uv_id     VARCHAR(20) PRIMARY KEY,
    uv_type   VARCHAR(100) NOT NULL,
    rate_type VARCHAR(50) CHECK (rate_type IN ('per_sheet','per_unit','flat')),
    rate      NUMERIC(12,4) CHECK (rate IS NULL OR rate >= 0),
    active    BOOLEAN DEFAULT TRUE
);

CREATE TABLE foiling_master (
    foil_id   VARCHAR(20) PRIMARY KEY,
    foil_type VARCHAR(100) NOT NULL,
    rate_type VARCHAR(50) CHECK (rate_type IN ('per_sheet','per_unit','flat')),
    rate      NUMERIC(12,4) CHECK (rate IS NULL OR rate >= 0),
    active    BOOLEAN DEFAULT TRUE
);

CREATE TABLE embossing_master (
    embossing_id   VARCHAR(20) PRIMARY KEY,
    embossing_type VARCHAR(100) NOT NULL,
    rate_type      VARCHAR(50) CHECK (rate_type IN ('per_sheet','per_unit','flat')),
    rate           NUMERIC(12,4) CHECK (rate IS NULL OR rate >= 0),
    active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE die_cutting_master (
    die_id       VARCHAR(20) PRIMARY KEY,
    die_type     VARCHAR(100) NOT NULL,
    setup_cost   NUMERIC(12,4) CHECK (setup_cost   IS NULL OR setup_cost   >= 0),
    running_cost NUMERIC(12,4) CHECK (running_cost IS NULL OR running_cost >= 0),
    active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE binding_master (
    binding_id    VARCHAR(20) PRIMARY KEY,
    binding_type  VARCHAR(100) NOT NULL,
    rate_per_unit NUMERIC(12,4) CHECK (rate_per_unit IS NULL OR rate_per_unit >= 0),
    active        BOOLEAN DEFAULT TRUE
);

CREATE TABLE packaging_master (
    packaging_id   VARCHAR(20) PRIMARY KEY,
    packaging_type VARCHAR(100) NOT NULL,
    rate_per_unit  NUMERIC(12,4) CHECK (rate_per_unit IS NULL OR rate_per_unit >= 0),
    active         BOOLEAN DEFAULT TRUE
);

CREATE TABLE transport_master (
    transport_id   VARCHAR(20) PRIMARY KEY,
    location_name  VARCHAR(255) NOT NULL,
    transport_cost NUMERIC(12,4) CHECK (transport_cost IS NULL OR transport_cost >= 0),
    active         BOOLEAN DEFAULT TRUE
);

-- ==========================================
-- RULE TABLES  (effective-dated so historical quotes are reproducible)
-- ==========================================

CREATE TABLE wastage_rules (
    rule_id            SERIAL PRIMARY KEY,
    process_name       VARCHAR(100) NOT NULL,
    wastage_percentage NUMERIC(6,2) CHECK (wastage_percentage BETWEEN 0 AND 100),
    valid_from         DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to           DATE,
    active             BOOLEAN DEFAULT TRUE,
    CONSTRAINT chk_wastage_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE margin_rules (
    rule_id           SERIAL PRIMARY KEY,
    min_amount        NUMERIC(12,2) NOT NULL CHECK (min_amount >= 0),
    max_amount        NUMERIC(12,2),
    margin_percentage NUMERIC(6,2) CHECK (margin_percentage >= 0),
    valid_from        DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to          DATE,
    active            BOOLEAN DEFAULT TRUE,
    CONSTRAINT chk_margin_band        CHECK (max_amount IS NULL OR max_amount >= min_amount),
    CONSTRAINT chk_margin_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE gst_rules (
    gst_id         SERIAL PRIMARY KEY,
    category       VARCHAR(100) NOT NULL,
    gst_percentage NUMERIC(6,2) CHECK (gst_percentage BETWEEN 0 AND 100),
    valid_from     DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to       DATE,
    active         BOOLEAN DEFAULT TRUE,
    CONSTRAINT chk_gst_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- ==========================================
-- CUSTOMERS
-- ==========================================

CREATE TABLE customers (
    customer_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name VARCHAR(255) NOT NULL,
    phone         VARCHAR(50),
    email         VARCHAR(255),
    gst_number    VARCHAR(50),
    address       TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- QUOTATIONS
-- ==========================================

CREATE TABLE quotations (
    quotation_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id      UUID REFERENCES customers(customer_id),
    quotation_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    production_cost  NUMERIC(14,2) CHECK (production_cost IS NULL OR production_cost >= 0),
    margin_amount    NUMERIC(14,2) CHECK (margin_amount   IS NULL OR margin_amount   >= 0),
    gst_amount       NUMERIC(14,2) CHECK (gst_amount      IS NULL OR gst_amount      >= 0),
    grand_total      NUMERIC(14,2) CHECK (grand_total     IS NULL OR grand_total     >= 0),
    vendor_id        VARCHAR(20) REFERENCES vendors(vendor_id),
    status           VARCHAR(50) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','sent','approved','rejected','expired','converted')),
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_quote_customer ON quotations(customer_id);
CREATE INDEX idx_quote_vendor   ON quotations(vendor_id);
CREATE INDEX idx_quote_status   ON quotations(status);

-- ==========================================
-- QUOTATION ITEMS
-- Stores BOTH the selections (FKs) and the snapshotted costs, so an
-- estimate is fully auditable and reproducible.
-- ==========================================

CREATE TABLE quotation_items (
    item_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id     UUID NOT NULL REFERENCES quotations(quotation_id) ON DELETE CASCADE,
    product_id       VARCHAR(20) REFERENCES products(product_id),

    -- selections used for this line
    paper_id         VARCHAR(20) REFERENCES paper_master(paper_id),
    machine_id       VARCHAR(20) REFERENCES machine_master(machine_id),
    lamination_id    VARCHAR(20) REFERENCES lamination_master(lamination_id),
    uv_id            VARCHAR(20) REFERENCES uv_master(uv_id),
    foil_id          VARCHAR(20) REFERENCES foiling_master(foil_id),
    embossing_id     VARCHAR(20) REFERENCES embossing_master(embossing_id),
    die_id           VARCHAR(20) REFERENCES die_cutting_master(die_id),
    binding_id       VARCHAR(20) REFERENCES binding_master(binding_id),
    packaging_id     VARCHAR(20) REFERENCES packaging_master(packaging_id),
    transport_id     VARCHAR(20) REFERENCES transport_master(transport_id),

    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    sheets_required  INTEGER CHECK (sheets_required IS NULL OR sheets_required >= 0),
    color_mode       VARCHAR(20) CHECK (color_mode IS NULL OR color_mode IN ('single','4color')),
    machine_size     VARCHAR(20) CHECK (machine_size IS NULL OR machine_size IN ('small','big')),

    -- snapshotted costs
    paper_cost        NUMERIC(14,2) DEFAULT 0 CHECK (paper_cost        >= 0),
    printing_cost     NUMERIC(14,2) DEFAULT 0 CHECK (printing_cost     >= 0),
    plate_cost        NUMERIC(14,2) DEFAULT 0 CHECK (plate_cost        >= 0),
    lamination_cost   NUMERIC(14,2) DEFAULT 0 CHECK (lamination_cost   >= 0),
    uv_cost           NUMERIC(14,2) DEFAULT 0 CHECK (uv_cost           >= 0),
    foil_cost         NUMERIC(14,2) DEFAULT 0 CHECK (foil_cost         >= 0),
    embossing_cost    NUMERIC(14,2) DEFAULT 0 CHECK (embossing_cost    >= 0),
    die_cutting_cost  NUMERIC(14,2) DEFAULT 0 CHECK (die_cutting_cost  >= 0),
    binding_cost      NUMERIC(14,2) DEFAULT 0 CHECK (binding_cost      >= 0),
    packaging_cost    NUMERIC(14,2) DEFAULT 0 CHECK (packaging_cost    >= 0),
    transport_cost    NUMERIC(14,2) DEFAULT 0 CHECK (transport_cost    >= 0),
    total_cost        NUMERIC(14,2) DEFAULT 0 CHECK (total_cost        >= 0)
);
CREATE INDEX idx_qitem_quote   ON quotation_items(quotation_id);
CREATE INDEX idx_qitem_product ON quotation_items(product_id);

-- ==========================================
-- JOB CARDS
-- ==========================================

CREATE TABLE job_cards (
    job_card_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id       UUID REFERENCES quotations(quotation_id),
    vendor_id          VARCHAR(20) REFERENCES vendors(vendor_id),
    machine_id         VARCHAR(20) REFERENCES machine_master(machine_id),
    job_status         VARCHAR(50) NOT NULL DEFAULT 'planned'
                       CHECK (job_status IN ('planned','in_progress','on_hold','completed','cancelled')),
    planned_start_date DATE,
    planned_end_date   DATE,
    remarks            TEXT,
    created_at         TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_job_dates CHECK (planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date >= planned_start_date)
);
CREATE INDEX idx_job_quote   ON job_cards(quotation_id);
CREATE INDEX idx_job_vendor  ON job_cards(vendor_id);
CREATE INDEX idx_job_machine ON job_cards(machine_id);

-- ==========================================
-- updated_at trigger
-- ==========================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendors_updated    BEFORE UPDATE ON vendors    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated   BEFORE UPDATE ON products   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated  BEFORE UPDATE ON customers  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quotations_updated BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
