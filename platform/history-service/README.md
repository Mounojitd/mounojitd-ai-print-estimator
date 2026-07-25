# History-match service (Phase B1)

*"Show me what we did for a school annual report"* → recommend a **configured solution** (spec + a
ready-to-quote brief) from past jobs. `../../PLATFORM_PLAN.md` §3.6.

**Confidentiality is the design centre.** The 341-job pre-production database is confidential and stays
server-side. This service never loads the workbook directly — it reads an **anonymised** specs file and,
on top of that, **scrubs any currency mention** from everything it returns. It never surfaces a historical
price, client identity, or raw message. *History informs the spec; the live engine prices it.*

## Two-step: ingest (local, confidential) → serve (safe)

```bash
# 1) INGEST — runs on the server, over the confidential workbook. Output is anonymised + gitignored.
python3 tools/export_history.py            # db/pre_production/*.xlsx  ->  data/jobs.jsonl
#    drops: Amount, Order Total, Client identity, Raised By, Billing Note, Original Message

# 2) SERVE — pure Node, no external calls.
node server.mjs                            # → http://127.0.0.1:8799  (internal search page at /)

# smoke — runs over a SYNTHETIC fixture (no real data); also asserts the privacy guarantees. 12/12.
node smoke.mjs
```

Set `QUOTE_APP_URL=http://127.0.0.1:8795` so the search page's "Price this live →" opens the customer
quote app with the recommended brief prefilled.

## API

| Method | Path | |
|---|---|---|
| GET | `/health` | index size (no confidential data) |
| POST | `/search` | `{query, limit?}` → `{recommendation, matches:[{score, productType, spec, suggestedBrief}]}` |
| GET | `/products` | distinct product types + counts (browse) |
| GET | `/` | internal search page |

Every match carries only the **spec** (size, paper, printing, coating, binding, typical quantity) and a
**suggestedBrief** you can POST straight to the quote-service `/intake`. Never an amount, client, or raw text.

## How matching works

Pure-Node **TF-IDF cosine** over each job's spec text (product type weighted), with a curated **synonym
expansion** so customer words reach shop vocabulary (*annual report → book/brochure*, *wedding → card/
invitation*, *carton → box/packaging*). Deterministic, no API keys, no data leaves the box.

**Embeddings are a drop-in upgrade** behind the same `buildIndex`/`search` seam (see `schema.sql` for the
pgvector sketch) — swap the vectors, keep the ranking and the anonymised output shaping.

## Privacy guarantees (asserted in the smoke)

- Anonymised at ingest: no amount, order total, client identity, raised-by, billing, or raw message.
- Currency scrubber removes any `₹ / Rs. / INR / …/- / rupees` that slipped into a spec free-text field.
- The server-side search text (`_text`, may contain names) is never included in a response.
- Gibberish returns an honest empty result, not a wrong recommendation.

## Honest scope / next

- Historical prices are intentionally **not** exposed or reused — the recommendation is the *solution*,
  and the current engine prices it (so stale prices can't leak into new quotes).
- Clustering near-duplicate specs into one canonical recommendation, and an estimator-only view with
  richer internals, are later refinements. Feeding confirmed actuals back (B3) is a separate slice.
