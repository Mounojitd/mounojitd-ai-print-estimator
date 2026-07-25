# Quote service (Phase 1 — the customer slice)

The customer-facing slice of `../../PLATFORM_PLAN.md` §3.4:

```
showcase → intake (plain-language brief) → spec confirm → estimate → saved, shareable quote + delivery date
```

This service is **only glue** — it holds no pricing logic. The price comes from the validated
`pricing-service` (P0.4a/c), the catalogue from the shared catalog store (P0.4b). Here we add: the
intake preview, quote persistence, share-by-token, and the delivery-date calc. *AI guides, math decides.*

## Run

```bash
# 1) start the pricing service (headless engine)
cd ../pricing-service && PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node server.mjs   # :8787
# 2) start this service
cd ../quote-service && node server.mjs                       # → http://127.0.0.1:8795  (customer app at /)

# end-to-end smoke (boots BOTH services against a throwaway quotes dir):
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node smoke.mjs   # 16/16
```

No native dependencies — the dev store is a JSON file under `data/` (`QUOTE_DATA_DIR` to override).
Production target is Postgres (`schema.sql`); swap in a pg-backed store with the same method surface.

## API

| Method | Path | |
|---|---|---|
| GET | `/health` | counts + pricing URL |
| GET | `/catalog` `[?family=]` | product showcase (templates) |
| POST | `/intake` | `{brief, product?, qty?, margin?}` → priced **preview** (detected spec + price + lead time), **not saved** |
| POST | `/quotes` | `{brief, …, customer?, asOf?}` → prices, stamps versions + delivery date, saves, returns `{token, shareUrl, …}` |
| GET | `/quotes/:token` | the shareable quote |
| POST | `/quotes/:token/confirm` | mark confirmed (order & payment is P1.7) |
| GET | `/quotes` `[?limit=]` | recent quotes (owner view) |

## Honest scope

- **"AI intake" today = the engine's validated parser.** The brief is parsed by the same
  `applyVoiceSpec` that was reconciled against NK Sir's 341 jobs — deterministic, not a black box.
  A conversational LLM intake (ask-back for missing fields, upsell) is a later enhancement; the seam
  is `POST /intake`, which any smarter front-end can call unchanged.
- **Unpriceable briefs are refused, not guessed** — `/quotes` returns `422 {reason}` and saves
  nothing, so no customer ever gets a made-up number. (See the smoke's "some flyers" case.)
- **Every saved quote is a snapshot** — spec, itemised price, lead time, delivery date and the
  rate-card version that produced it — so it is reproducible and can be honoured later. `engineVersion`
  (a hash of the engine build) is still to add.
- **Delivery date** = `asOf` + lead-time **working days** (Sundays skipped). `asOf` defaults to today
  but can be passed for reproducibility.

## Next (P1.7)

`POST /quotes/:token/confirm` is the handoff point: from a confirmed quote, create an `order` and take
an advance/balance payment through a pluggable gateway.
