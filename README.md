# AI Print Estimator — V1

Cost-estimation backend for print quotations. PostgreSQL schema + FastAPI API
with a transparent, master-data-driven cost engine.

```
ai-print-estimator/
├── db/
│   ├── schema.sql      # PostgreSQL 13+ schema (revised, with integrity constraints)
│   └── seed.sql        # Sample vendors, paper, machines, rates, rules
└── backend/
    ├── app/
    │   ├── main.py        # FastAPI app
    │   ├── config.py      # env-driven settings
    │   ├── database.py    # SQLAlchemy engine/session
    │   ├── models.py      # ORM models
    │   ├── schemas.py     # Pydantic request/response models
    │   ├── estimator.py   # simple v1 cost engine (master-driven)
    │   ├── services/      # Phase-2 imposition-based estimating (NKK sir's logic)
    │   │   ├── estimation_config.py  # ALL tunable constants & rate tables
    │   │   ├── geometry.py           # imposition: signatures, ups, sheet fit
    │   │   ├── paper_calculator.py   # sheets + wastage + paper cost/weight
    │   │   ├── plate_calculator.py   # plates per colour × forms
    │   │   ├── print_calculator.py   # impressions + minimum charge
    │   │   ├── postpress_calculator.py
    │   │   ├── margin_calculator.py  # component margin + job-tier floor
    │   │   ├── gst_calculator.py
    │   │   └── estimate_engine.py    # orchestrator + runnable demo
    │   └── routers/
    │       ├── masters.py     # GET listing endpoints for dropdowns
    │       └── quotations.py  # estimate / save / read quotations
    ├── requirements.txt
    └── .env.example
```

## 1. Database

```bash
createdb print_estimator
psql -d print_estimator -f db/schema.sql          # core normalised schema
psql -d print_estimator -f db/masters_extend.sql  # widen masters + paper_types / materials_master
psql -d print_estimator -f db/rate_masters.sql    # staging tables for the rate-quote import
# (skip db/seed.sql once you import the real masters below)
```

The schema requires the `pgcrypto` and `btree_gist` extensions (both ship with
standard PostgreSQL; the script creates them).

### Import the Excel rate masters

`Rate_Masters.xlsx` holds 11 sheets of real vendor quotes (lamination, UV,
foiling, embossing, die-cutting, binding, plate, packaging) plus wastage / margin
/ GST rule templates. `import_excel.py` parses them header-first, auto-creates a
`vendors` row for every vendor *name* it finds (linking by FK), and loads each
sheet into the matching staging table from `rate_masters.sql`.

```bash
cd backend
pip install -r requirements.txt
# validate parsing without a database first:
python -m app.scripts.import_excel --file "C:/Users/AR04/Downloads/Rate_Masters.xlsx" --dry-run
# then load for real (uses DATABASE_URL from .env, or pass --database-url):
python -m app.scripts.import_excel --file "C:/Users/AR04/Downloads/Rate_Masters.xlsx"
```

It is idempotent — each run fully reloads the staging tables.

### Import the real master data (run this FIRST)

The clean per-master workbooks live in `db/files/` (Vendor / Process / Paper /
Product / Transport / Material). `import_masters.py` promotes them straight into
the engine masters — this is where the **real numbers** come from.

```bash
cd backend
python -m app.scripts.import_masters --dir ../db/files --dry-run   # validate parsing
python -m app.scripts.import_masters --dir ../db/files             # load
python -m app.scripts.import_excel  --file ../db/files/Rate_Masters.xlsx  # then rate quotes
```

Run order matters: `import_masters` loads the **canonical vendors** (VEN001–043
from Vendor_Master), so when `import_excel` reads the rate sheets, vendor *names*
resolve to those existing ids instead of creating duplicates. Any rate-sheet
vendor name not found in Vendor_Master is auto-created and listed at the end so
you can merge it (e.g. the "PRAKSH"/"PRAKASH" typo).

Mapping: Vendor Master → `vendors`, Process Master → `machine_master`,
Paper Pricing → `paper_master` (+ Paper Types → `paper_types`),
Product Master → `products`, Transport Master → `transport_master`,
Material Master → `materials_master`. Sheet sizes in inches are converted to mm.

## 2. Backend

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt
copy .env.example .env                              # then edit DATABASE_URL
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/docs for interactive Swagger.

## 3. Try an estimate

```bash
curl -X POST http://127.0.0.1:8000/quotations/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "cards",
    "items": [{
      "product_id": "PRD001",
      "quantity": 5000,
      "paper_id": "PAP001",
      "sheets_required": 250,
      "machine_id": "MAC001",
      "color_mode": "4color",
      "machine_size": "big",
      "lamination_id": "LAM001",
      "transport_id": "TRN001"
    }]
  }'
```

Returns a full per-line cost breakdown plus production cost, margin, GST, and
grand total. `POST /quotations` runs the same calc and persists it (with the
selections snapshotted, so the quote is reproducible and auditable).

## Phase-2 estimation engine (NKK sir's imposition logic)

The `app/services/` package implements real-world, imposition-based estimating:
open size → trim/gripper/side-lay/colour-bar → signatures → ups → machine fit →
sheets + make-ready & running waste → plates + impressions → finishing →
weight → packing → freight → overhead → margin → GST. It's **pure Python and
needs no database**, so you can test it the way NKK sir prescribed — run it,
compare to a real quote, adjust the table, repeat:

```bash
cd backend
python -m app.services.estimate_engine     # runs a worked example
```

Worked example (2000 × 16pp A5 booklet, 4-colour both sides, 170gsm) →
₹38,272 grand total, ₹19.14/unit. **Every number is a tunable placeholder** in
[`estimation_config.py`](backend/app/services/estimation_config.py): make-ready
sheets/forme, impression rate, plate charge, overhead %, margin %, GST %, sheet
allowances (trim 3mm, gripper 12mm, side-lay 5mm, colour-bar 10mm). The
*structure* follows the transcript; calibrate the *values* against real jobs.

## Cost engine assumptions (V1)

These live at the top of [`estimator.py`](backend/app/estimator.py) and are the
knobs to tune against the shop's real costing:

- `sheets_required` is provided by the caller (press sheets before wastage). A
  later version can derive it from product geometry + paper sheet size.
- Printing wastage from `wastage_rules` is applied to sheets before per-sheet
  paper/print rates.
- Print rate chosen by the qty band for the machine; per-sheet rate by
  color_mode + machine_size; plate charge is a one-off.
- Finishing `rate_type` ∈ `per_sheet | per_unit | flat`. Die cutting = setup +
  running×qty. Binding/packaging = rate×qty. Transport = flat.
- Margin from the matching `margin_rules` band; GST from `gst_rules` by category.

## Notable schema decisions vs. the original draft

- `quotation_items` stores the **selections** (FKs) used, not just costs — so an
  estimate can be audited and regenerated.
- Rate/cost masters carry `valid_from`/`valid_to` so historical quotes don't
  change when rates are updated.
- Indexes on every FK; `CHECK` constraints for positive amounts and valid bands;
  a `btree_gist` exclusion constraint prevents overlapping qty rate bands.
- `gen_random_uuid()` (pgcrypto) instead of legacy `uuid-ossp`; `TIMESTAMPTZ`
  throughout; constrained `status` / `job_status` values.
