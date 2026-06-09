# MASTER PROJECT STATE — AI Print Estimator

> Single source of truth for resuming work. Keep this updated. A brand-new session
> should be able to continue from this file alone.
> Last updated: 2026-06-09

---

## 1. Project Goal

AI-assisted **printing estimator** for a Kolkata commercial printer. Rates come from the
**Naba Mudran / Anderson agreement**. Given a job it must compute paper requirement,
best sheet, best machine, colour/plate/impression costs, wastage, and produce a priced
**quotation + internal job sheet** — like a professional print MIS, not a toy calculator.

**Primary deliverable:** the offline single-file app **`paper_calculator.html`**
(double-click, no server/internet needed). Copies live on the user's **Desktop** and
**Downloads** as `Paper_Calculator.html`, and in the repo at
`backend/app/static/paper_calculator.html`. The user works in this offline file.

A FastAPI backend + imported Excel masters also exist (see Architecture) but are secondary.

---

## 2. Current Phase

**Phases 1–5 implemented** (Phase 5 = separate cover/text components + binding).

| Phase | Scope | Status |
|---|---|---|
| 1 | Paper calculation engine | ✅ done |
| 2 | Machine selection engine | ✅ done |
| 3 | Colour / plate / impression engine | ✅ done |
| 4 | Estimate / quotation / job sheet | ✅ done |
| 5 | Separate cover / text components + binding | ✅ done |
| — | AI recommendation layer | ⬜ not started |

---

## 3. Completed Features

- **Paper:** open vs closed (spread) size — booklet portrait → 2×W, landscape → 2×H;
  margins all in **mm** (bleed, gripper, side-lay, backside, paper-trim); signature
  fold-fit with downgrade + warning; suggest-reduce-to-fit (~X mm); sheet comparison
  ranked by waste %.
- **Imposition diagram:** numbered cells, FRONT/BACK work-and-turn view, saddle-stitch
  page-order toggle, 🖨 print cut sheet.
- **Machine:** real press database, fit check (max ≥ sheet w/ rotation, sheet ≥ min,
  colours ≥ needed), recommend fastest, **"no press" flag**, run-time estimate, price band.
- **Colour/Plate/Impression:** colour presets (1+0 … 6+6), **plates = colours × signatures**,
  explicit impression count, real agreement coating rates.
- **Coating:** **cover-only by default** (one signature's sheets) vs all-sheets.
- **Pricing:** Paper + Printing (Anderson tiers) + Plates + Coating + Packing + Freight +
  Overhead 12% + Margin (28%) + GST 18% (CGST/SGST or IGST). Tied to selected machine band.
- **Phase 4 (user):** quotation + internal job-sheet generators (`printJobSheet`, quote
  builder, `quoteMeta`, `docHeader`, `specsTable`, `openPrintDocument`).
- **Phase 5:** optional separate 4pp cover, independently optimized cover
  stock/sheet/press/colours/coating, configurable binding, and combined costing.

---

## 4. Business Rules (approved — do not change without request)

1. User **selects** the signature.
2. System **validates** whether the selected signature physically fits the sheet.
3. If it does not fit → **downgrade to the largest valid signature** + show warning.
4. Sheet comparison **ranks by waste**.
5. Machine selection **validates sheet compatibility**.
6. Sheets larger than machine capacity are **flagged** ("no press").
7. **Plates = Colours × Signatures.**
8. Printing cost depends on the **selected machine** (band small/big).
9. Lowest-waste sheet is **NOT** automatically best if no machine can run it.
10. **Geometry & production constraints override theoretical calculations.**

---

## 5. Machine Rules

Press database (baked into `MACHINES` in the file):

| Press | Max (in) | Min (in) | Colours | Speed/hr | Band |
|---|---|---|---|---|---|
| Heidelberg SM102 | 28×40 | 14×20 | 4 | 9,000 | big |
| Planeta Variant | 28×40 | 14×20 | 4 | 7,000 | big |
| Man Roland Parva | 25×36 | 13×18 | 2 | 7,000 | big |
| Man Roland R-200 | 20×30 | 10×14 | 5 | 8,000 | small |
| Komori L-40 | 20×30 | 10×14 | 4 | 15,000 | small |
| Komori L-32 | 19×25 | 10×14 | 4 | 13,000 | small |
| Komori Florence | 18×25 | 10×14 | 4 | 13,000 | small |

- **Fit** = sheet ≤ max (either orientation) AND sheet ≥ min AND colours ≥ needed.
- **Band** = big if max long ≥ 34" AND short ≥ 22", else small.
- **30×40 fits no press** (largest press is 28×40) → flagged; must cut down.

---

## 6. Pricing Rules (Naba Mudran / Anderson agreement)

**Printing per side** (charged on total sheets, per side cf + cb):
- Small machine: 4c lot ₹1500 (≤3000 sheets) then ₹125/1000; 2c ₹1000; 1c ₹600.
- Big machine: 4c ₹2325 lot then ₹195/1000 (≤10k) / ₹175/1000 (>10k); 2c ₹1225/205/185; 1c ₹625/208/195.

**Plates:** ₹475/plate small, ₹575/plate big. **Plate count = (cf + cb) × signatures.**

**Coatings** (per 100 sq.in × sheets, with job minimum; cover-only by default):
matt 0.40/min1000 · gloss 0.28/800 · BOPP 0.45/1000 · Full UV 0.30/1000 ·
gloss aqua 0.12/800 · matt aqua 0.25/1000 · drip-off 0.55/3500.

**Packing** ₹35/carton (15 kg/carton) · **Freight** ₹8/kg (min ₹300) ·
**Overhead** 12% · **Margin** default 28% · **GST** 18% (CGST 9 + SGST 9, or IGST 18 inter-state).

**Impression tiers:** 0–3000 sheets = lot/minimum charge, above = per-1000 rate.

---

## 7. Production Rules

- `signatures = ceil(pages ÷ chosen signature)`, **capped by fold-fit** per sheet
  (sheet holds up to 4 × spreads-that-fit; largest standard fold {4,8,16,32} ≤ that).
- `sheets = signatures × products + make-ready + running-waste%`.
- With separate cover enabled: `text pages = total pages - 4`; cover is a separate 4pp
  run with its own stock, sheet, press, colours, plates, and coating.
- Packing, freight, overhead, margin, and GST are charged once on the combined job.
- Pages/leaf: 1 leaf = 2 pages; booklet imposes the **open spread**.

---

## 8. Known Bugs / Issues

- **🔴 Imposition/waste inconsistency (CONFIRMED 2026-06-09, NKK sir flagged "weight wrong").**
  Booklet imposes the **open spread as one atomic block**; sheet packing reports `ups`
  spreads/side, but the chosen signature may use **fewer** spreads than `ups`. Example —
  Shyam Metalics 11.5×11.5 landscape, 180pp, 160gsm, 250 copies: engine picks 25×36, packs
  `ups=3` spreads/side → caps signature to **8pp**, but an 8pp section only uses 2 spreads/side,
  so ~⅓ of each sheet is unused. **Waste% is computed on `ups=3`** → reports **9.1%** when real
  unused area is ~40%. Result: **signature ↔ sheets-per-book ↔ waste% are out of sync**, and
  since `weight = sheets × sheet-weight`, the **weight inherits the error**. Sanity check: 8×
  (11.5×11.5+bleed) ≈ 1,060 sq.in > 25×36 sheet (900 sq.in) → a true 8pp can't sit 2×2 on that
  sheet; spread-as-one-block over-claims capacity for square/coffee-table sizes.
  **Weight formula itself is correct** (`kg = areaM2 × gsm/1000 × sheets`); error is upstream
  (sheet/signature/sheet-count), NOT the weight math. **Blocked on NKK sir's correct figures:**
  his actual sheet size, signature, total sheets (250 & 500), and paper weight in kg — then
  back-calc which step diverges and fix only that step.
- **Coating unit** (per-100-sq.in) is an assumption — confirm real basis with NKK sir.
- **Work-and-turn** not yet an option (currently work-and-back: plates = colours × sigs).
- **Make-ready** is a single flat input, not strictly per-forme / per-plate-change.
- Default binding rates/minimums are editable assumptions and need vendor validation.

---

## 9. Open Questions

- Confirm the coating charge unit/basis with NKK sir.
- Add work-and-turn vs work-and-back as a selectable method?
- Validate signature ganging & sheet counts against a **real NKK-sir-quoted job**.
- Should cover (heavier stock) be a separate component from the text block?

---

## 10. Next Tasks (candidates)

- (a) Polish the Phase-4 quotation / internal job-sheet layout.
- (b) Add the work-and-turn plate option.
- (c) Model cover vs text as separate components (stock + finishing).
- (d) Validate against a real quoted job, then build the AI recommendation layer.

---

## 11. Technical Architecture

- **Offline app:** `paper_calculator.html` — single self-contained HTML (HTML + CSS + JS),
  no server, no network. Pure compute is separated from the DOM:
  - `computePaper(inp)` — paper geometry/fit/signatures (pure, Node-testable).
  - `MACHINES`, `machineFit`, `machinesFor`, `machineBand`, `renderMachine`.
  - `priceJob(o,p)` — full cost engine (pure-ish, uses `SELECTED_MACHINE`).
  - `currentPriceParams`, `showPrice`, `render`, `showSheet`, `drawInto`, `buildSVG`,
    `printJobSheet` + quotation builder (Phase 4).
- **Repo:** `C:\git\ai-print-estimator` (git, committed each change). Secondary FastAPI
  backend in `backend/app/` (services: paper_calc, rates, estimate_engine, nl_estimate;
  API: paper, estimate; static: index/paper/paper_calculator.html) + Excel masters in
  `db/files/` (Vendor/Paper/Process/Product/Transport/Material/Rate masters).
- **Tooling:** Python 3.12 at `C:\Users\AR04\AppData\Local\Programs\Python\Python312\`;
  **Node** available (used to syntax-check + unit-test pure functions before delivery).
  No Postgres locally (backend DB inserts untested; parsing/engine verified).
- **Delivery routine:** after each change → Node `--check` + functional test → copy file to
  Desktop + Downloads + repo static → `git commit`.

---

## 12. Decision Log

| Date | Decision | Reason | Impact |
|---|---|---|---|
| 2026-06-08 | Signature = user choice + downgrade-if-no-fit + flag | NKK sir picks the fold; geometry must still allow it | 20×30 drops 16pp→8pp (10,600 sheets); others keep 16pp (5,350) |
| 2026-06-08 | Plates = colours × signatures | Each signature is different artwork → own plates | 80pp 4+4 book: 8→40 plates (₹4,600→₹23,000) |
| 2026-06-08 | Machine-aware "best" (no-press flag) | Lowest-waste sheet useless if no press runs it | 30×40 flagged "no press"; real best = 23×36/25×36 on Heidelberg |
| 2026-06-08 | Open/spread size for booklets, margins in mm (gripper 10, +backside, +paper-trim) | NKK sir review of live app | 7×9.5 closed → 14×9.5 open; fixed unit-mixing bug |
| 2026-06-09 | Coating = cover only by default | Lamination is on the cover, not all inner pages | Book lam ~1 signature's sheets; per-book ₹197→₹173 |
| 2026-06-09 | Anderson agreement rates baked in (printing/plate/coating) | Real contracted rates supplied by user | Price is real, not placeholder (except paper ₹/sheet = manual input) |
| 2026-06-09 | Validation vs real quote (Shyam Metalics Coffee Table Book, Anderson 15.05.26) | NKK sir said "weight is wrong" | Found imposition/waste inconsistency (see Bug #1): spread-as-atomic over-claims sheet capacity for square sizes → signature/sheets/waste/weight out of sync. Awaiting NKK sir's correct sheet/sig/sheets/weight to fix the right step. Also exposed missing components for premium hardcase jobs: binding/sewing/case-making, back-to-back pasting, separate cover stock, multi cover finishes, all-pages inside coating. |

> Do not re-argue approved decisions unless the user asks.
