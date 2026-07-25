# Vendor + purchase-order service (Phase B4/B5)

The last depth slice of `../../PLATFORM_PLAN.md` §3.8: **vendors, bought-out routing, and purchase orders.**

- **B4 — vendor master + bought-out routing.** A vendor master (typed + capability-tagged), and a rule that
  classifies each stage of a job's production traveller as **made in-house** or **bought-out**, suggesting
  capable vendors for the bought-out ones (lamination, foil, die-cut, binding, large-format, dispatch…).
- **B5 — purchase orders.** Raise a PO to a vendor for bought-out work — lines + amounts + the vendor's
  payment terms — with a `draft → issued → received → closed` lifecycle. A PO can be **seeded from a job's
  bought-out stages** so the buyer only fills rates.

## Run

```bash
# needs the production service running and sharing its job store (PRODUCTION_DATA_DIR).
node server.mjs                    # → http://127.0.0.1:8805  (vendor + PO board at /)

# full end-to-end smoke (boots all five services): 16/16
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs

# load the REAL vendor master locally (output is gitignored):
python3 tools/import_vendors.py
```

Vendors bootstrap from the committed **synthetic** `data/vendors.seed.json`. `import_vendors.py` replaces that
with the real 44-vendor master (names/contacts/GST) into `data/vendors.json`, which is **gitignored** — the
real master never enters the repo, only the code + synthetic seed do.

## API

| Method | Path | |
|---|---|---|
| GET | `/vendors` `[?capability=&type=]` · `/vendors/:id` | vendor master |
| POST/PUT | `/vendors` · `/vendors/:id` | create / update |
| GET | `/jobs/:ref/sourcing` | in-house vs bought-out plan for a job + suggested vendors |
| POST | `/pos` | `{jobRef?, vendorId, lines:[{description,qty,rate}], terms?}` → PO (draft) |
| POST | `/pos/from-job/:jobRef` | `{vendorId}` → draft PO of the bought-out stages that vendor can do |
| GET | `/pos/:ref` · `/pos` `[?jobRef=]` | purchase orders |
| POST | `/pos/:ref/status` | `{status}` → advance the lifecycle (illegal jumps 409) |

## Sourcing rules

`data/sourcing_rules.json` maps a stage-name pattern → `{sourcing, capability}` (first match wins, default
in-house). It's **data** — edit which processes you sub-contract without touching code. Grounded in the real
vendor vocabulary: Paper Supplier · Material · Postpress · Printing · Digital · Transporter.

## Honest scope / next

- Sourcing is a **suggestion** from rules + capabilities; the buyer decides and issues. Rates on a
  from-job PO start at 0 — no invented vendor prices.
- Not in this slice: vendor rate cards (so PO lines can be auto-priced), GRN/partial receipts, three-way
  match (PO vs receipt vs vendor bill), and reconciling bought-out actuals back into the B3 variance. Those
  are the natural follow-ups once real vendor rates are loaded.
