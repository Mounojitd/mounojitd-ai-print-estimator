# Production + actuals service (Phase B2/B3)

Closes the platform's learning loop (`../../PLATFORM_PLAN.md` §3.7):

- **B2 — production traveller.** A paid order becomes a shop-floor **job** whose stages come from the
  *engine's own* production traveller (`productionSteps`) — the same step + QC list the job sheet prints.
  Operations advance each stage as it clears QC; job status is derived from stage progress.
- **B3 — actuals → rate corrections.** When the job ships, record the **actual** amount. The service compares
  it to the **estimate** and, once a product shows a persistent gap across enough jobs, surfaces an
  **advisory** rate-card correction. A human approves it in the rate-card admin (P0.4b) and the pricing
  service reloads (P0.4c). We never auto-edit a rate — *AI guides, math decides.*

## Run

```bash
# needs pricing + quote + order services running and sharing the quote/order stores.
node server.mjs                    # → http://127.0.0.1:8800  (shop-floor job board at /)

# full end-to-end smoke (boots all four services): 13/13
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs
```

## API

| Method | Path | |
|---|---|---|
| POST | `/jobs` | `{orderRef}` → job with traveller (idempotent; **409 if advance unpaid**) |
| GET | `/jobs/:ref` · `/jobs` | job(s) with derived status + variance |
| POST | `/jobs/:ref/stages/:i` | `{status: pending\|in_progress\|done, by?, note?, measured?}` → advance a stage |
| POST | `/jobs/:ref/actual` | `{amount, quantity?, spoilage?, note?}` → capture actuals (B3) |
| GET | `/rate-suggestions` | per-product estimate-vs-actual variance + advisory correction |
| GET | `/` | shop-floor job board (advance stages, record actuals, see suggestions) |

## The B3 signal

For each product with closed jobs, the service computes the **median variance** `(actual − estimate)/estimate`.
It becomes **actionable** only when there are at least `MIN_JOBS_FOR_SUGGESTION` (default 2) closed jobs and
the median is beyond `±VARIANCE_THRESHOLD_PCT` (default 8%). A positive median means we **under-quoted** →
suggest *raising* that product's margin/rates; negative → *lowering*. The suggestion names the exact
rate-card to review (`PUT /rate-cards/product_margin/<product>`) and reminds you to `/reload` the pricing
service after — it does not change anything itself.

## Honest scope / next

- **Advisory only, on purpose.** A rate change is a business decision; the loop stops at a recommendation with
  the evidence (job count + median variance). Auto-tuning would be exactly the "fit the answer" trap NK Sir's
  discipline warns against.
- Stage timestamps + `by` give a basic audit trail; a fuller traveller (machine assignment, per-stage spoilage,
  material issue/return, bought-out routing to B4/B5) is the next depth.
- Actuals here are a single final amount; splitting actuals by cost head (paper/print/bindery) would sharpen
  *which* rate to correct, not just the margin.
