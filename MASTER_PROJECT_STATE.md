# MASTER PROJECT STATE — AI Print Estimator

> Single source of truth for resuming work. Keep this updated. A brand-new session
> should be able to continue from this file alone.
> Last updated: 2026-06-16

---

## ▶ SESSION RESUME (read this first)

**Product = the offline single-file `paper_calculator.html`** (HTML+CSS+JS, no server). All work is here.
**Live:** https://mounojitd.github.io/mounojitd-ai-print-estimator/ — GitHub Pages, repo
`Mounojitd/mounojitd-ai-print-estimator` (branch `main`, git creds cached, push works).
**Publish after edit:** copy `paper_calculator.html` → `index.html` + `backend/app/static/` + Desktop +
Downloads, then `git push origin main` (or run `publish.ps1`). Pages rebuilds ~1 min.
**Verify before publish:** extract `<script>` → `node --check`; mirror functions into node to check math
vs sir's hand numbers. Real Python: `C:\Users\AR04\AppData\Local\Programs\Python\Python312\python.exe`.

**Latest commit at save:** `ff2cf51` (COVER-sheet cutting → Komori L-32 surfaces as cheapest cover press,
as sir said: cuts 23×36→31×21, 4-up, small band). Prior `fe45ada` cover machine-choice display. Prior `9cd336c` (spine-driven binding + saddle-stitch limits, cover
embellishments ×3 combinable, "Open size with bleed" rename). Prior: `b8afb94` 8pp S/S form
to sir's swing-form (Front [[5,4],[8,1]], Back [[3,6],[2,7]]). 24/32pp patterns still pending sir's forms.

**PENDING from sir's 2026-06-17 review:** ① TEXT-side CUT-TO-REQUIRED-PRINT-SIZE — cut parent to the
imposition bounding box, not machine-max; he expects 12,000→6,000 sheets (1→2 cuts/parent) + a cutting
diagram in the job card. HIGH RISK (rewrites core TEXT paper purchasing) → need ONE full worked example
(parent/print size/ups/forms/copies/MR + expected sheet & parent count) to build + node-verify. (② cover
machine-choice DONE fe45ada. ③ COVER-sheet cutting DONE ff2cf51 → L-32 cheapest. The same cut approach now
needs porting to the TEXT path once sir confirms his numbers.)

**Full system audit (2026-06-17):** node-verified all of sir's canonical hand numbers (204pp/12pp=1,105;
80pp gang-2; calendar 90000/8-up single-sided=11,913; weight 0.0929 kg/sheet; Anderson per-forme tiers;
plates) + a full real-world priced job — 29/29 checks pass. App loads in-browser with no console errors.
No engine bugs found. Only the 8pp page-layout (not arrows) differed from sir's new drawing → fixed above.

**Workflow:** NKK sir sends WhatsApp audio transcripts (Bengali/Hindi) + hand-drawn PDFs, reviews the LIVE
app, finds real bugs. Match his hand numbers exactly. Decode → fix → node-verify → publish → he refreshes.

**Verified core logic (don't regress):** standard folds {4,8,12,16,24,32} only; forms/book=⌈pages÷form⌉;
ganging reuse-cut-part (layouts=⌈forms÷formsPerSheet⌉, good=layouts×copies); running waste per FORME +
make-ready paper per FORM(layout); PARENT-sheet purchasing when machine-cut (buy parent not cut, cost/wt on
parent); two weights (consumption vs finished); cover = separate wrap (front+spine+back), spine=(pages÷2)×
(gsm/1000)mm; coating client-driven; per-forme printing; live auto-recalc.

**OPEN / PENDING:** ① the head-direction ARROWS — sir wants exact direction per panel from his drawing
(currently form top=↓/bottom=↑ toward fold, cover=↑); NEEDS sir to specify each. ② Digital click-rate
card (digital still uses offset rate — wrong). ③ Req5 machine hard-reject, Req10 Audit Mode, spoilage line.
④ Printing/impression/plate/coating rate tables pending sir's verification. See §6f and below.

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

## 6f. Sir review round 3 (2026-06-12, voice + hand-folded form PDFs) ★

1. **Forms are ANY multiple of 4** — `sig = floor(min(target, 4×ups)/4)×4`. Sir: "3-up is right,
   8pp is wrong" → 3 spreads/side = **12pp form** (he drew the 12-page form). OVERRIDES the old
   {4,8,16,32}-only rule. Verified vs his example: 204pp ÷ 12 = 17 forms × 65 = **1105 sheets**
   (app previously said 1875). Signature select now offers 4/8/12/16/24/32 + Auto.
2. **Separate cover does NOT subtract 4 from text pages** — cover is EXTRA (own 4pp, own stock).
   Pages field = text/inside pages, relabeled.
3. **Paper TYPE dropdowns** (text + cover) filter the grade list; auto-by-GSM respects the type.
4. **Machine selection Auto / Manual** — manual lists every press in the master; non-fitting picks
   get a loud warning ("cut the paper down to the machine size").
5. **Form drawings rebuilt from sir's hand-folded PDFs** (`4-P form`, `8 pp Ss form`, `12 page from`,
   `16 pF`): classic section-sewing patterns — 4pp F[4,1]/B[2,3]; 8pp F[8,5/1,4]/B[6,7/3,2];
   12pp F[8,9,12/5,4,1]/B[11,10,7/2,3,6]; 16pp F[5,12,9,8/4,13,16,1]/B[7,10,11,6/2,15,14,3].
   Top half rotated 180° (heads to the middle), bold "FOLD — heads meet" middle line, red spine
   folds inside spreads, orange zigzag folds between spreads. Leaf pairing (n/n+1, odd front)
   verified for all four patterns. Old cell-boundary FOLD marks (sir: "this is not the folding
   mark") removed.
- 🟡 Still pending sir: printing impression tables / minimums / plate prices; digital-process
  branch (qty < 200 → ask offset/digital; digital presses 13×19 + banner) — noted, not yet built.

## 6e. PER-FORME costing (2026-06-11, NKK sir review of live estimator) ★ major correction

Sir's findings, all fixed:
1. **Wastage was job-level → now PER FORME.** Every printed side (forme) gets its own make-ready
   sheets + running-waste %. `formes = signatures × sides`; make-readies = formes for work&back,
   = signatures for work&turn/tumble. `total = good + formes×copies×run% + makeReadies×setup`.
2. **Printing was one price for the whole job → now PER FORME.** Each forme is a separate press run
   of `formeRun = total/signatures` sheets with its OWN lot/minimum tier. 18 text sides + 2 cover
   sides = **20 make-readies + 20 printing prices** (verified: 9 sigs 4+4 + cover → 18+2=20 ✓).
   Short runs now correctly lot-charge per forme (e.g. 1300 sheets/forme → ₹2325 × 18 = ₹41,850,
   not one ₹2325). Plates were already correct (per sir).
3. **Fold positions now drawn** on the imposition diagram — numbered dash-dot FOLD lines at the
   internal cell boundaries (fold 1 = between columns, then cross folds), front + back.
- 🟡 PENDING SIR'S VERIFICATION: printing impression tables, minimum prices, plate-per-plate prices
  (he said he will check the tables). Rates unchanged until he confirms.

## 6d. Imposition drawing fixes (2026-06-10, sir: "drawing not correct")

- **Back-side flip now follows Work style:** work&turn = L⇄R mirror, work&tumble = T⇅B mirror (gripper
  moves to opposite edge), work&back = 180° sheetwise. Was hardcoded "work-and-turn" H-mirror always.
- **Page imposition is per-signature, not whole book.** One sheet = one signature, so the diagram imposes
  `o.sig` pages (collation verified 4→1-4, 8→1-8, 16→1-16), labeled "1 of N signatures". Previously tiled
  total book pages → mislabeled multi-signature books. Page-order now ON by default for signature products.

## 6c. Process-master spec (2026-06-10) — implemented gaps

Real **machine master** from `Process master data.pdf` baked into `MACHINES` (8 presses, mm→in):
Heidelberg SM102 (Nabamudran M001 & Darpan M007), MAN Roland 200 (M002), Parva 28×40 (M003),
Komori L-40 (Balaji M004), Komori L-32 (M005), Heidelberg SM74 (Darpan M008), Mitsubishi Daiya 18×25
(Florence). Each has vendor, location, max-paper, **max-print area**, min, gripper(mm), colours, speed.
- ✅ Product classification (signature vs non-signature) — `isSig()`, two optgroups.
- ✅ **Non-signature extent multiplier** — `extentFlat` (default 1) multiplies paper; no signatures.
- ✅ **Binding-dependent page validation** — saddle/none = ×4, perfect/sewn/case = ×2; warns + suggests nearest valid.
- ✅ **3-way cover detection** — Cover type select: No cover / Self cover / Separate cover.
- ✅ Paper-master automation (auto ₹/sheet + weight by GSM), machine auto-select + price compare, least-waste imposition.
- 🟡 Remaining nice-to-haves: gutter/colour-bar margins as explicit inputs; per-machine operating-cost field
  (PDF cost columns were blank). Fit uses max-paper; max-print shown + gripper-clearance warning.

## 6b. NKK SIR'S CANONICAL METHOD (★ source-of-truth algorithm — build & test against this)

> His guidance: *"Make the algorithm, then test it manually 2–10 times until perfect.
> Set the logic right, and AI can do the rest."* Status: ✅ done · 🟡 partial · ⬜ open.

**STEP 0 — Inputs to collect:** finished/folded size (H×W), open/spread size, GSM, paper type,
extent (pages; 1 leaf = 2 pages), binding type, **trim or no-trim**. → ✅ (🟡 explicit trim/no-trim toggle is open)

**STEP 1 — PAPER CALCULATION** (his most important: *"once this is set, the rest is easy"*):
- Orientation → auto open/spread size (7×9.5 portrait → 14×9.5). → ✅
- Signature: choose 4/8/16/32 (max) **or Auto**; pages ÷ signature = signatures = sheets/book. → ✅
- Margins (mm): trim 3, bleed 3, backside 3, gripper 10, side-lay 3 each, paper-trim 3 all four sides. → ✅
- Fit/ups: test normal + rotated, pick least waste. → ✅
- If it doesn't fit → suggest reduce 1–5 mm / bigger sheet / another machine. → ✅
- Cut bigger stock down (30×40 → 20×30…) to what's available. → ✅
- Wastage: setup/make-ready (fixed sheets) + running waste (%). → ✅
- Paper cost **per-sheet AND per-kg**; weight = GSM × area. → ✅ (price panel shows kg + ₹/kg)
- **Work-and-turn vs work-and-tumble.** → ✅ (Work style selector; turn/tumble share plates → plate count halves vs work-and-back)
- **Trim / no-trim toggle** (Step 0). → ✅ (checkbox; no-trim zeroes bleed + paper-trim)

**STEP 2 — MACHINE:** check availability across presses; know each machine's gripper / max print /
max paper / min paper; find which can run the sheet; recommend best fit + compare prices. → ✅
(per-press gripper + max-print area + min; cross-press price-comparison table, cheapest highlighted, click to switch)

**STEP 3 — COLOUR:** default 4+4, allow any combo + 5th/6th spot; check machine colour capacity. → ✅

**STEP 4 — PLATE + IMPRESSION (separate):** plates = colour × forme; impression has a minimum
(0–2000/3000 same rate), then recurring rate after. → ✅

**STEP 5 — THE REST** (*"very easy after the above"*): weight → packing/cartons → freight →
overhead 12% → margin → GST → quotation + job sheet + signature plan. → ✅

**Outstanding vs his method:** ✅ NONE — all Steps 0–5 implemented. Bug #1 (imposition/waste) resolved
2026-06-10 by honest waste-on-signature math. *(per-kg, work-and-turn/tumble, trim toggle, per-press
gripper + machine price comparison, waste fix all DONE 2026-06-10.)*

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

- **🟢 RESOLVED 2026-06-10 — imposition/waste inconsistency (Bug #1).** Fix: waste % now computed on the
  **pages the chosen signature actually uses**, not the sheet's full geometric capacity:
  `eff = 100 × sig × cellSpread / (4 × sheetArea)` for signature products (flats unchanged). When the
  fold fills the sheet (sig = 4×ups) this equals the old formula; when the fold drops below capacity it
  correctly shows the real waste. Shyam 180pp @250 on 25×36 now reads **8pp · 23 sigs · 6,138 sheets ·
  570 kg · 39.4 % waste** — fully consistent (was a misleading 9.1 %). Method-consistent with NKK sir's
  standard folds {4,8,16,32} & signatures = sheets/book; no ganging/non-standard folds invented. Honest
  waste now drives sheet selection, so the engine flags awkward square-on-oblong jobs to cut down.
  *(Original report retained below for history.)*
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

- **🟢 RESOLVED — "printing-rate discrepancy" was multi-vendor, not a bug (2026-06-10).**
  The Anderson/Naba Mudran agreement w.e.f. 01.06.2026 (`db/files/vendor_db/ANDERSON_AGREEMENT_26-27.txt`)
  **confirms the app's baked-in printing rates EXACTLY**: 23×36+ 4c ₹2325/₹195/₹175; 19×29 4c
  ₹1500/₹125; 2c ₹1225/205/185; 1c ₹625/208/195; plates ₹475(19×29)/₹575(23×36); +₹575 one-time
  for black-plate change. Wastage clause also confirms app default (<5k actual, >5k = 5%).
  The higher numbers in `PRINTING_RATES.csv` (Nabamudran Heidelberg ₹720/1000) and the photo cards
  (Balaji Press: 19×25 ₹2400/360, 20×30 ₹2700/460) are **other vendors' rates** → the estimator
  needs **vendor selection**, not a rate fix. App currently = Anderson/Naba Mudran only.
- **🟠 Coating rates are vendor-mixed.** App coating (gloss-lam 0.28/800, matt 0.40/1000…) matches
  the photo card, NOT the Anderson agreement (gloss-lam 0.35, BOPP 0.40, matt 0.45 per 100sq.in;
  aqueous gloss 0.18/min600, matt 0.30/min1000). Decide per-vendor finishing source.
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
| 2026-06-10 | Real vendor database imported → `db/files/vendor_db/*.csv` | User supplied `Complete_Vendor_Database_With_Samples.xlsx` (clean source, 7 sheets) | Now have REAL: PAPER_PRICING (478 rows, ₹/sheet by grade/GSM/size — `Price_Per_Sheet` reliable, `Price_Per_Kg` unreliable for special papers; "SQ.METER" col is actually sq-inches), PRINTING_RATES (per-press impression tiers + plate), POST_PRESS_RATES (binding ₹/pc: Hardcase 95, Perfect 9–28, Centre-stitch 3.5, Section-sewing 4.32/section; lamination/UV/varnish/foil/emboss/aqua per-sq-in & lot rates), MATERIAL & TRANSPORT. Fills the missing hardcase/finishing components AND surfaces printing-rate discrepancy (Open Q). Wire-in pending after weight validation. |
| 2026-06-10 | **Weight formula VERIFIED by NKK sir** (WhatsApp audio) | He hand-checked 0.580646 m²×160 = 92.90 g → 0.0929 kg/sheet | "Absolutely correct, standard." Per-sheet weight math is off the suspect list. The real fault he flagged = **product classification**, not weight. |
| 2026-06-10 | **Wired vendor DB into pricing** (paper/cover auto-rate, vendor printing, coating source, real binding) | User: "full" integration | Paper & cover ₹/sheet auto-pickup from embedded PAPER_DB (grade→GSM→size, exact or area-scaled). Press-rate source dropdown (Anderson default + Nabamudran/Komori L-40/L-32/Balaji 20×30/19×25; flat sources scale 4-col rate ×cols/4). Coating source toggle (Standard card default vs Anderson agreement). Binding defaults = real POST_PRESS (hardcase 95, perfect 9, sewn 6.75, centre-stitch 3.5). Anderson stays default everywhere; approved logic unchanged, only made selectable. |
| 2026-06-10 | **Implemented NKK sir's product-classification spec** in `paper_calculator.html` | His spec: identify product type BEFORE any calc; signature-based vs non-signature pipelines must not mix | Added `SIGNATURE_PRODUCTS` set + `isSig()`; expanded product dropdown into 2 optgroups (Book/Catalogue/Magazine/Manual/Annual/Brochure-multi vs Leaflet/Poster/Card/Calendar-sheet/Calendar-table/Dangler/Insert); non-signature path bypasses signature+extent (size→ups→qty→wastage→paper); wastage now exactly Production=Required×(1+run%) then +setup; added **Reams = total/500** (table col + subheaders). Verified: NKK's calendar example 90000÷8-up → 11,250 good → 11,913 total (matches his 11,912.5). Node-checked, synced to Desktop/Downloads/static. |

> Do not re-argue approved decisions unless the user asks.
