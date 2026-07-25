# Print Platform — Build Plan (Phase 0.4 onward)

> Scoping document for turning the validated **estimator** into the full **platform** from
> `printplatformroadmap`. Written 2026-07-25. The estimator (pricing brain + ~28 product
> types + production sheet) is done and validated against NK Sir's 341 recorded jobs; this
> plan covers the application wrapper around it.

## 0. The one decision that anchors everything: the engine

There are **two engines** in this repo, and they have diverged:

| | `paper_calculator.html` (JS) | `backend/` (Python/FastAPI) |
|---|---|---|
| Last touched | 2026-07-25 (this session) | 2026-07-16 (before this session) |
| Products | ~28 incl. bag/lanyard/pouch/rigid box/jacket/NCR | missing all of the above |
| Menu rates, DIGITAL_AUTO, diagnostics, unit fixes | ✅ | ❌ none |
| Validated vs 341 real jobs | ✅ | ❌ |

**Decision: the validated JS engine is the single source of truth. Do NOT re-port it to
Python.** Re-porting means re-deriving and re-validating months of reconciliation work — the
exact "rebuild every product type" trap the roadmap's reframe #2 warns against. Instead:

- **Extract the JS engine into a standalone pricing service** (reframe #3 — "AI guides, math
  decides": one deterministic, versioned, auditable engine). Everything else — auth, orders,
  vendors — is ordinary code that *calls* it.
- The stale `backend/` Python is kept only for reference/DB scaffolding ideas; its estimator
  code is superseded.

### Two ways to run the JS engine as a service (MVP → hardened)

1. **MVP (this plan starts here): headless-driver wrapper.** A Node service launches headless
   Chromium once, loads the engine page, and per request calls
   `applyVoiceSpec → run → combinedPrice`, returning itemised JSON. This reuses the engine
   **exactly as validated** — zero re-port, zero re-validation. It's how the 341-job test
   harnesses already drive it, so we know it works.
2. **Hardened (later): extract to a pure-JS module.** Lift the engine functions out of the
   HTML into `engine/estimator.mjs` (no DOM), unit-tested, imported by both the web app and
   the service. Faster, no browser per node. Do this once the platform shape is stable — it's
   a mechanical refactor guarded by the existing 341-job harness as a regression oracle.

## 1. Stack (boring on purpose)

- **Pricing service:** Node 22 + the validated JS engine (MVP wrapper → pure module).
- **Backend/API:** Node (Fastify/Express) or FastAPI — **Node preferred** so the whole
  platform is one language and the engine is a direct import once extracted.
- **Database:** Postgres (structured spec + rate cards + orders + vendors).
- **Frontend:** React/Next.js (customer showcase + intake + quote; admin panel).
- **Auth:** email/OTP + sessions; roles = customer / estimator / admin / vendor.
- **Payments:** pluggable provider (Razorpay/PayU for UPI/cards/net-banking), designed for
  advance/balance + credit terms from day one (roadmap risk note).
- **Hosting:** one cloud VM/app platform; the LLM is called only at intake + history-match.

## 2. Data model (Phase 0.1 / 0.2 — catalog & rates as DATA, not code)

Core tables:

- `product_template` (name, family, engine_product_key) — maps a catalogue product to the
  engine's product value (e.g. "Perfect-bound book" → `booklet`).
- `attribute` / `attribute_value` / `validation_rule` — the configurable spec per template.
- `rate_card` + `rate_line` (paper by gsm/size/type, press make-ready+run, bindery, finishing,
  wastage %) — **versioned**, so any historical quote can be reproduced exactly.
- `customer`, `account`, `session`.
- `quote` (spec snapshot + engine version + rate-card version + itemised result + lead time),
  `quote_line` (for sets/bundles).
- `order`, `payment`.
- `vendor`, `purchase_order`, `po_line`; `line_item.sourcing` = made-in-house | bought-out.
- `job` (production traveller stages + QC results), `actual` (estimate-vs-actual for B3).

Quote reproducibility = store `{engine_version, ratecard_version, spec}` on every quote.

## 3. Phase order (interleave breadth already-done with depth)

Product breadth (Track A) is effectively complete in the engine, so this plan is mostly the
**wrapper + Track B depth**, in shippable slices:

1. **P0.4a — Pricing service** ✅: Node service wrapping the validated engine;
   `POST /estimate` → itemised JSON + lead time. Smoke-tested against known jobs.
2. **P0.4b — DB + API skeleton** ✅: Postgres schema above; CRUD for templates + rate cards;
   admin panel to edit them. Rate cards move from code → data.
3. **P0.4c — Wire the engine to the rate cards** ✅: pricing service loads the rate cards at
   startup / `POST /reload` and mutates the engine's rate globals; an admin edit now moves future
   quotes; every estimate is stamped with a `ratecardVersion` fingerprint. Closes the code→data loop.
4. **P1 — Customer slice** ✅: showcase → intake (plain-language brief) → spec confirm → estimate
   (calls the pricing service) → quote saved + shareable by token with a delivery date. Delivered as
   `platform/quote-service/` (customer web app + `/intake`, `/quotes`, `/quotes/:token`). Intake uses
   the engine's validated parser today; the LLM intake is a drop-in behind the same `/intake` seam.
5. **P1.7 — Order & payment**: pluggable gateway; advance/balance.
6. **B1 — History match**: ingest past jobs (private DB stays server-side) + embeddings; "show
   me what we did for a school annual report" → recommend a configured solution.
7. **B2/B3 — Production + actuals**: the engine's production traveller becomes DB-backed job
   travellers; capture actuals vs estimate; feed corrections back into rate cards.
8. **B4/B5 — Vendors, POs, bought-out** routing.

Rule of thumb (roadmap): never let breadth get more than one step ahead of produce-and-track.

## 4. First milestone (this turn): the pricing service

Deliverable: `platform/pricing-service/` — a Node HTTP service that runs the validated engine
and returns an itemised estimate for a plain-language brief. This is the concrete foundation
everything else calls. See that folder's README.

## 5. Risks / decisions to settle

- **Rate-card ownership** — who maintains them, how often (stale rates = wrong quotes).
- **Engine versioning** — tag the engine + rate cards per quote for reproducibility & B3.
- **Confidential DB** — the 341-job database never leaves the server; B1 search is server-side.
- **Payments** — advance/balance/credit from day one, not bolted on.
- **Packaging estimating** already has its own path in the engine (dieline) — keep it distinct.
