# Pricing service (Phase 0.4a + 0.4c)

Exposes the **validated** estimator engine (`paper_calculator.html`) as an HTTP API, so the rest
of the platform (accounts, quotes, orders, vendors) can get a deterministic estimate without
re-implementing the pricing logic. See `../../PLATFORM_PLAN.md` §0 for why we wrap the JS engine
instead of re-porting it to Python.

**P0.4c — the engine now reads rate cards live.** At startup (and on `POST /reload`) the service
loads the catalog rate cards from the shared store (`../api/store.mjs`) and mutates the engine's
rate-card globals (`MARGIN_DEFAULT`, `BINDING`, `PRINT_SOURCES`, `LF_MEDIA`, `POUCH_MEDIA`,
`LANYARD_MEDIA`, `NCR_PLY_RATE`, `RIGIDBOX_STYLES`). The seed equals the engine's own values, so
this is a no-op **until an admin edits a rate** — then future quotes move. Every estimate is
stamped with `ratecardVersion` (a `rc-<count>-<Σversions>` fingerprint) for reproducibility.

## Run

```bash
npm install            # installs playwright
npx playwright install chromium
npm start              # → http://127.0.0.1:8787
```

In this repo's dev sandbox, Chromium is already at `/opt/pw-browsers` and Playwright at
`/opt/node22`; run the smoke test without installing anything:

```bash
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs            # 5/5 basic pricing
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke-ratecard.mjs   # 5/5 edit→reload→price moves
```

## API

### `GET /health`
`{ "ok": true, "engine": "<path>", "ratecardVersion": "rc-75-75" }`

### `POST /reload`
Re-reads the rate cards from the store and re-applies them to the engine (call after an admin edits
a rate card). `{ "ok": true, "ratecardVersion": "rc-75-76" }`

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
             "coating": 0, "margin": 0, "gst": 0, "menuRate": null },
  "ratecardVersion": "rc-75-75"
}
```
Unpriceable specs (e.g. no size) return `{ "unpriceable": true, "reason": "..." , "price": null }`
rather than a wrong number.

## Notes / next steps
- The engine keeps global state on one page, so requests are **serialized** (one at a time). For
  throughput, run N service instances behind a load balancer, or do the "pure-JS module"
  extraction in PLATFORM_PLAN §0 (removes the browser entirely).
- Every estimate carries `ratecardVersion` for reproducibility (PLATFORM_PLAN §2). `engine_version`
  (a hash of `paper_calculator.html`) is still to add.
