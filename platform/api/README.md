# Catalog + rate-card API (Phase 0.4b)

Turns the engine's hard-coded rate cards into **editable, versioned DATA** with an admin panel —
the roadmap's reframe #2 ("the catalog must be data, not code"). See `../../PLATFORM_PLAN.md` §2.

## Run

```bash
node server.mjs          # → http://127.0.0.1:8790  (admin panel at /)
node smoke.mjs           # 7/7 checks, against a throwaway copy of data/
```

No native dependencies — the dev store is JSON files under `data/`. Production target is Postgres
(`schema.sql`); swap in a pg-backed store with the same method surface as `store.mjs`.

## What's here

- **`schema.sql`** — Postgres DDL: `product_template`, `attribute`/`attribute_value`/`validation_rule`,
  `rate_card` (+ `rate_card_history` for reproducible quotes).
- **`data/templates.json`** — 28 product templates (catalogue product → engine key + family),
  extracted from the live engine.
- **`data/rate_cards.json`** — 75 rate cards extracted from the engine: 6 press rate-cards, 14
  bindings, 28 product margins, and the media rates (large-format, pouch, lanyard, NCR, rigid-box).
- **`store.mjs`** — repository (JSON dev store; `DATA_DIR` override for tests). Every edit bumps the
  version and appends to a history log.
- **`server.mjs`** — CRUD API. **`admin/index.html`** — the admin panel (list by category, edit &
  save with version bump + history).

## API

| Method | Path | |
|---|---|---|
| GET | `/health` | counts |
| GET | `/templates` `[?family=]` | product templates |
| GET | `/templates/:key` | one template |
| GET | `/rate-cards` `[?category=]` | rate cards |
| GET | `/rate-cards/categories` | category → count |
| GET | `/rate-cards/:category/:key` | one rate card |
| PUT | `/rate-cards/:category/:key` | update `{values, label?}` → new version + history |
| GET | `/rate-cards/:category/:key/history` | change log |

## Honest scope / next step (P0.4c)

This delivers the **data + admin** layer: rate cards are now data an owner can edit, versioned so any
past quote's rates are reproducible. **The pricing engine does not yet read these live** — today it
still holds its own copy of the values (identical, since the seed was extracted from it). Wiring the
pricing service to consume these rate cards (so an admin edit changes future quotes) is the next
slice, **P0.4c**: have the engine/service load rate overrides from this API at startup, tagged with
the rate-card version on every quote.
