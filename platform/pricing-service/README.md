# Pricing service (Phase 0.4a)

Exposes the **validated** estimator engine (`paper_calculator.html`) as an HTTP API, so the rest
of the platform (accounts, quotes, orders, vendors) can get a deterministic estimate without
re-implementing the pricing logic. See `../../PLATFORM_PLAN.md` §0 for why we wrap the JS engine
instead of re-porting it to Python.

## Run

```bash
npm install            # installs playwright
npx playwright install chromium
npm start              # → http://127.0.0.1:8787
```

In this repo's dev sandbox, Chromium is already at `/opt/pw-browsers` and Playwright at
`/opt/node22`; run the smoke test without installing anything:

```bash
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs
```

## API

### `GET /health`
`{ "ok": true, "engine": "<path>" }`

### `POST /estimate`
Request:
```json
{ "brief": "A4 booklet cover + 48 pages 130 gsm art 4 color both side section sewn quantity 1000",
  "product": null, "qty": null, "margin": null }
```
- `brief` (required) — plain-language job description (the same text the app's voice/text intake parses).
- `product` (optional) — force the engine product key (e.g. `booklet`, `rigidbox`).
- `qty` (optional) — override quantity.
- `margin` (optional) — override margin %.

Response:
```json
{
  "product": "booklet", "quantity": 1000, "unpriceable": false, "reason": null, "leadTimeDays": 7,
  "price": { "grand": 131857, "unit": 131.86, "paper": 0, "printing": 0, "plates": 0,
             "coating": 0, "margin": 0, "gst": 0, "menuRate": null }
}
```
Unpriceable specs (e.g. no size) return `{ "unpriceable": true, "reason": "..." , "price": null }`
rather than a wrong number.

## Notes / next steps
- The engine keeps global state on one page, so requests are **serialized** (one at a time). For
  throughput, run N service instances behind a load balancer, or do the "pure-JS module"
  extraction in PLATFORM_PLAN §0 (removes the browser entirely).
- Every estimate should eventually carry `{engine_version, ratecard_version}` for reproducibility
  (PLATFORM_PLAN §2) — add when the DB layer (P0.4b) lands.
