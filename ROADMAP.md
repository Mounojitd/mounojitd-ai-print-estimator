# AI Printing Estimation System — Roadmap & Architecture Plan

Response to NKK sir's roadmap (2026-06). Status: estimation engine ~80% done in the offline
single-file `paper_calculator.html`. This plan takes it to a production MIS.
Last updated: 2026-06-18.

---

## The key decision: two tracks

The offline single-file app can do **calculation + UI**, but it **cannot** save quotations,
archive, do accounts, approval, history, or AI — those need a **backend + database**. So we run
two tracks; the backend becomes the single source of truth once it exists.

### Track A — Finish & validate the offline engine (continue now)
The proven 80%. Keep polishing per sir's reviews; it stays the calculation reference.
- ✅ done: paper/forms/ganging/wastage, cut-to-required-size, cover/text split, two diagrams,
  cutting diagram, binding by pages·qty, per-machine printing rates, GST out, overhead out.
- ⏳ remaining: UI readability pass (cover vs text clearly separated, all paper + machine sheet
  sizes shown, no overlap); database-mapping audit (the 130→128 GSM bug); finish testing matrix.

### Track B — Stand up the backend + database (start now, the true unblock)
Repo already has a FastAPI skeleton (`backend/app/`). Make the engine a **standalone
deterministic service** and add persistence.
1. Extract the calc engine to a pure module (port the verified JS logic to Python, 1:1, with the
   same node-verified numbers as tests).
2. Build the **master databases** as real tables (Paper, Machine, Binding, Material/Finishing,
   Rate cards) — single source, no hidden references.
3. Build the **Quotation database** (schema below) — save every quote, archive, version, recalc.
4. Auth + roles (sales = price only; estimator/manager = full breakdown).
5. Approval workflow. 6. Form-based input. 7. AI recommendation (text) → voice later.

---

## Quotation Database schema (the next real unblock)

```
PAPER_MASTER        (paper_id PK, category, paper_name, gsm, grain, parent_size,
                     sheet_size, cost_per_kg, cost_per_sheet, supplier, stock_status, active)
MACHINE_MASTER      (machine_id PK, name, vendor, category(offset/digital/large),
                     min_w,min_l,max_w,max_l,print_w,print_l, colours, speed_iph,
                     setup_waste, running_waste_pct, cost_per_hour, active)
PRINT_RATE_CARD     (rate_id PK, machine_id FK, upto_qty, lot4, per1000_tier_json,
                     plate_per_colour, effective_from)
BINDING_MASTER      (binding_id PK, type, min_pages, max_pages, spine_rule,
                     rate_samples_json(pages,qty,rate), min_charge)
MATERIAL_MASTER     (material_id PK, group(lam/uv/foil/emboss/varnish/coating),
                     name, unit, rate, setup_cost, min_charge, effective_from)

QUOTATION_HEADER    (quote_id PK, quote_no UNIQUE, date, customer_id FK, product_type,
                     quantity, status(draft/sent/approved/archived), version,
                     created_by, grand_total, unit_price, rate_card_version)
QUOTATION_LINE      (line_id PK, quote_id FK, component(text/cover/case),
                     paper_id, machine_id, colours, binding_id, sheets, parents,
                     weight_kg, cost_breakdown_json)
QUOTATION_ARCHIVE   (same shape as header; superseded versions move here)
CUSTOMER            (customer_id PK, name, gstin, state, contact)
USER                (user_id PK, name, email, role(sales/estimator/manager), pwd_hash)
RATE_CARD_VERSION   (version PK, effective_from, note)  -- lets old quotes recalc on their rates
```

Rules:
- Every quote **auto-saves** to `QUOTATION_HEADER` + `QUOTATION_LINE` on generate.
- Editing a sent/approved quote creates a **new version**; old one → `QUOTATION_ARCHIVE`.
- Old quotes **recalc on their stored `rate_card_version`** (version control).
- Search/compare/retrieve by customer, product, date, quote_no.

---

## Realistic sequence (minimum launch = end September)

**Weeks 1–2 (now):** Track A UI cleanup + DB-mapping audit (130→128 fix). Track B: backend
skeleton + Paper/Machine/Binding/Material master tables + engine-as-service (port + tests).

**Weeks 3–4:** Quotation DB (save/archive/version/recalc) + basic auth & roles. Form-based input.

**Weeks 5–7:** Hard-case estimator (PLC + chipboard + endpapers + case-making + case-size 3mm
square) — its own validated cycle. Approval workflow.

**Weeks 8–9:** Testing matrix (machines × papers × bindings × colours × embellishments).
AI **text** recommendation engine. Spiral/Wire-O + stationery.

**End Sept launch scope:** soft-cover books, hard-case books, spiral/wire-o, stationery,
quotation DB, approval workflow, AI text recommendation. (Voice AI = after launch.)

---

## Risks / guardrails
- **Lock the minimum scope** — resist adding product types until launch ships.
- **One engine** — once the backend engine exists, the HTML becomes a thin client; don't let logic
  drift across two codebases.
- **Hard case is a mini-project** — board grain, case extension, spine board, endpaper grain.
- **Voice AI last** — build on the deterministic engine, never instead of it.
- **Every rate from master tables only** — no hardcoded values (current hardcoded rates move to
  `*_MASTER` / `RATE_CARD` tables).
