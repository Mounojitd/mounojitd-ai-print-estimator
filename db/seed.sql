-- ==========================================
-- AI PRINT ESTIMATOR  —  Sample / seed data (V1)
-- Run after schema.sql.  Rupee (INR) rates, India GST.
-- ==========================================

-- ---------- VENDORS ----------
INSERT INTO vendors (vendor_id, vendor_name, vendor_type, contact_person, phone, email, gst_number, address, lead_time_days) VALUES
('VEN001', 'Sai Paper Mart',        'paper',     'Ramesh Iyer',  '9820012345', 'sales@saipaper.in',     '27ABCDE1234F1Z5', 'Bhiwandi, MH',  2),
('VEN002', 'Precision Offset Press','printer',   'Anil Shah',    '9820023456', 'anil@precisionoffset.in','27FGHIJ5678K1Z2', 'Andheri, Mumbai',1),
('VEN003', 'Glow Finishers',        'finishing', 'Pooja Nair',   '9820034567', 'pooja@glowfinish.in',   '27KLMNO9012P1Z9', 'Vasai, MH',     1),
('VEN004', 'QuickMove Logistics',   'transport', 'Sandeep Rao',  '9820045678', 'ops@quickmove.in',      '27PQRST3456U1Z3', 'Bhiwandi, MH',  1);

-- ---------- PRODUCTS ----------
INSERT INTO products (product_id, product_name, category, description, default_gsm, default_binding) VALUES
('PRD001', 'Business Card',     'cards',     '90x54mm business card, 4-color', 300, 'none'),
('PRD002', 'A5 Brochure',       'brochure',  'A5 4-page brochure',             170, 'none'),
('PRD003', 'Perfect Bound Book','book',      '128-page paperback, A5',          80, 'perfect'),
('PRD004', 'Mono Carton Box',   'packaging', 'Folding carton, die-cut',        300, 'none');

-- ---------- PAPER MASTER ----------
INSERT INTO paper_master (paper_id, paper_name, gsm, sheet_length_mm, sheet_width_mm, cost_per_sheet, cost_per_kg, vendor_id, moq) VALUES
('PAP001', 'Art Card 300gsm',     300, 711, 508, 6.5000,  95.00, 'VEN001', 500),
('PAP002', 'Art Paper 170gsm',    170, 711, 508, 3.2000,  88.00, 'VEN001', 500),
('PAP003', 'Maplitho 80gsm',       80, 762, 508, 1.1000,  82.00, 'VEN001', 1000),
('PAP004', 'SBS Board 300gsm',    300, 711, 508, 7.2000, 102.00, 'VEN001', 500);

-- ---------- MACHINE MASTER ----------
INSERT INTO machine_master (machine_id, vendor_id, machine_name, machine_type, max_sheet_size_name, max_length_mm, max_width_mm, color_capability, machine_speed_iph, pricing_model, lead_time_days) VALUES
('MAC001', 'VEN002', 'Heidelberg SM102', 'offset', 'Full Sheet (102cm)', 1020, 720, '4-color', 13000, 'per_sheet_band', 1),
('MAC002', 'VEN002', 'Heidelberg GTO52', 'offset', 'Half Sheet (52cm)',   520, 360, '4-color',  8000, 'per_sheet_band', 1);

-- ---------- PRINT RATE MASTER (non-overlapping qty bands per machine) ----------
INSERT INTO print_rate_master (rate_record_id, machine_id, vendor_id, min_qty, max_qty, rate_single_color, rate_4_color_big_machine, rate_4_color_small_machine, plate_charge_small, plate_charge_big) VALUES
-- Big machine (MAC001)
('PR001', 'MAC001', 'VEN002',     1,   1000, 0.6000, 1.8000, NULL, NULL, 350.00),
('PR002', 'MAC001', 'VEN002',  1001,  10000, 0.4500, 1.4000, NULL, NULL, 350.00),
('PR003', 'MAC001', 'VEN002', 10001, 1000000, 0.3500, 1.0000, NULL, NULL, 350.00),
-- Small machine (MAC002)
('PR011', 'MAC002', 'VEN002',     1,   1000, 0.5000, NULL, 1.2000, 180.00, NULL),
('PR012', 'MAC002', 'VEN002',  1001,  10000, 0.4000, NULL, 0.9000, 180.00, NULL),
('PR013', 'MAC002', 'VEN002', 10001, 1000000, 0.3000, NULL, 0.7000, 180.00, NULL);

-- ---------- FINISHING MASTERS ----------
INSERT INTO lamination_master (lamination_id, lamination_type, rate_type, rate, vendor_id) VALUES
('LAM001', 'Gloss BOPP',  'per_sheet', 0.8000, 'VEN003'),
('LAM002', 'Matt BOPP',   'per_sheet', 0.9000, 'VEN003'),
('LAM003', 'Thermal Matt','per_sheet', 1.2000, 'VEN003');

INSERT INTO uv_master (uv_id, uv_type, rate_type, rate) VALUES
('UV001', 'Spot UV',  'per_sheet', 1.5000),
('UV002', 'Full UV',  'per_sheet', 1.0000);

INSERT INTO foiling_master (foil_id, foil_type, rate_type, rate) VALUES
('FOIL001', 'Gold Foil',   'per_sheet', 2.0000),
('FOIL002', 'Silver Foil', 'per_sheet', 1.8000);

INSERT INTO embossing_master (embossing_id, embossing_type, rate_type, rate) VALUES
('EMB001', 'Single Level', 'per_sheet', 1.6000),
('EMB002', 'Multi Level',  'per_sheet', 2.4000);

INSERT INTO die_cutting_master (die_id, die_type, setup_cost, running_cost) VALUES
('DIE001', 'Standard Die', 1500.0000, 0.3000),
('DIE002', 'Complex Die',  3500.0000, 0.5000);

INSERT INTO binding_master (binding_id, binding_type, rate_per_unit) VALUES
('BIND001', 'Perfect Binding', 8.0000),
('BIND002', 'Saddle Stitch',   3.0000),
('BIND003', 'Spiral',          12.0000);

INSERT INTO packaging_master (packaging_id, packaging_type, rate_per_unit) VALUES
('PKG001', 'Shrink Wrap',  0.5000),
('PKG002', 'Carton Box',   2.0000);

INSERT INTO transport_master (transport_id, location_name, transport_cost) VALUES
('TRN001', 'Mumbai Local',  500.0000),
('TRN002', 'Pune',          1200.0000),
('TRN003', 'Rest of MH',    2500.0000);

-- ---------- RULE TABLES ----------
INSERT INTO wastage_rules (process_name, wastage_percentage) VALUES
('printing',   5.00),
('lamination', 3.00),
('die_cutting',4.00),
('default',    2.00);

INSERT INTO margin_rules (min_amount, max_amount, margin_percentage) VALUES
(0.00,        10000.00,   30.00),
(10000.01,    50000.00,   25.00),
(50000.01,    200000.00,  20.00),
(200000.01,   NULL,       15.00);

INSERT INTO gst_rules (category, gst_percentage) VALUES
('cards',     18.00),
('brochure',  18.00),
('book',      12.00),
('packaging', 18.00),
('default',   18.00);

-- ---------- A SAMPLE CUSTOMER ----------
INSERT INTO customers (customer_name, phone, email, gst_number, address) VALUES
('Acme Retail Pvt Ltd', '9876543210', 'purchase@acmeretail.in', '27ACMEX1234R1Z0', 'Lower Parel, Mumbai');
