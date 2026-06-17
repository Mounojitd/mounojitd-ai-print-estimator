# Printing Estimation System — Implementation Report

Response to NKK sir's 15-point review (2026-06-17). Product: `paper_calculator.html`
(offline single-file MIS). Live: https://mounojitd.github.io/mounojitd-ai-print-estimator/

Legend: ✅ done & verified · 🟡 partial · ⏳ pending sir's exact numbers/rate tables

---

## 1. Database Review — ✅ audited
Full audit done (2026-06-17): paper DB (457 rows embedded), machine master (12 presses:
8 offset + 4 digital), printing rates (Anderson + 5 vendor sources), coating sources
(Standard card + Anderson), binding table, embellishment table. All of sir's canonical
hand numbers re-verified by node harness (204pp/12pp=1,105; 80pp gang-2; calendar
90,000/8-up single-sided=11,913; weight 0.0929 kg/sheet; per-forme printing tiers; plates)
— 29/29 pass. Business logic verified independently of DB values.
🟡 Open: vendor selection layer; per-machine operating-cost column (blank in source PDF).

## 2. Binding Logic Module — ✅ done
Mandatory **Type of binding** field with all options: Saddle stitch, Side stitch,
Section sewn, Perfect binding, Section sewn + Perfect, Soft cover book, Hard case book,
Wire-O, Spiral, Comb, Pad, Back-to-back paste, Other/custom. Spine **recommends** a type
(never silently assumes) and the user can override. Binding drives spine, page-multiple
validation (folded=×4, leaf=×2, mechanical=×1), finishing, and costing.

## 3. Spine Thickness Calculation — ✅ done
Spine (mm) = (text pages ÷ 2) × GSM × **bulk factor** ÷ 1000. Bulk input (coated ~0.8–1.0,
uncoated ~1.2–1.5). Displayed live, editable, shown on cover diagram + job sheet.

## 4. Binding Recommendation Engine — ✅ done (sir's exact thresholds)
- Spine ≤ 2.5 mm → recommend **Saddle stitch** (auto-selected, no warning).
- Spine > 3 mm → **Warning**: "Spine thickness exceeds the recommended limit for Saddle
  Stitching. Section Sewing or Perfect Binding is recommended."
- Spine > 4.5 mm → **Error**: "Saddle Stitch Binding is not recommended… select Section
  Sewing or Perfect Binding." Override only via the explicit **Force binding** checkbox.

## 5. Cover and Text Separation — ✅ done
Cover is an independent production component: own paper, printing, colours, coating,
embellishments, press selection (with its own cut-down). Text and cover costed separately
then combined. Binding/packing/freight/overhead/margin/GST applied once on the combined job.

## 6. Naming Correction — ✅ done
"Print size (+bleed)" → **"Open size with bleed"** (size table + remarks).

## 7. Paper Planning Logic — ✅ done (cut-to-cheaper-press, both cover & text)
Most-economical sheet by waste/total; auto-rate by grade/GSM/size; parent-sheet purchasing.
**Both cover AND text** now choose the cheapest press route: a press runs the sheet WHOLE if
it fits, or CUTS the parent down to its print size if not — so a small-band press (Komori
L-32: 23×36 → 31×21 cut, 4-up, plate ₹475 + small lot) is auto-selected when it saves cost
(e.g. text 96pp/2000/4+4 → ₹129,948 on L-32-cut vs ₹144,648 big-whole). ⏳ grain-direction
compatibility still needs sir's rule.

## 8. Machine Selection Logic — ✅ done
Full press master with fit check + per-press print+plate cost; cheapest runnable
highlighted; Auto vs Manual. Large-vs-small trade-off is surfaced (cover ranks each press
by total cost). ⏳ full total-production-cost ranking incl. make-ready for the text path
ties into #7/#9.

## 9. Make-Ready Calculation — ✅ done
Printing make-ready is per-forme, separate from running waste (Good + Make-ready + Running =
Total, with waste %). **Finishing make-ready** now added per sir's rule (**10 sheets min,
40–50 max per operation**, default 25, clamped 10–50): every active finishing operation
(text: coating, folding, binding; cover: coating + each embellishment) consumes spoilage
sheets, folded into paper consumption (extra parent sheets at parent rate + weight) and shown
as its own line "Finishing make-ready (N ops × M sheets)".

## 10. Paper Consumption Logic — ✅ core done
Total = Good + Running waste + Make-ready (no double counting); parent-purchasing converts
print sheets → parent sheets. ⏳ explicit machine-waste / process-waste lines (with #9).

## 11. Costing Engine — ✅ rates wired from real POST_PRESS master
Real **POST_PRESS_RATES** master (sir's sheet, 80 vendor records) saved to
`db/files/vendor_db/POST_PRESS_RATES_2026.xlsx` + `.csv`. Finishing now uses his actual
numbers, structured as setup (lot minimum) + running (per-unit): lamination matt 0.45 /
gloss 0.28 per sq.in; Full UV 0.30/min1000; gloss aqua 0.12/800; matt aqua 0.25/1000;
varnish 0.10–0.12; drip-off 0.55/3500; Spot UV lot 1500 + ~1.3/pc; Foil lot 600 + ~1/pc
(+ die ₹30/sq.in); Emboss lot 700 + 1.25/pc. **Binding ₹/book corrected to his data:**
centre-stitch 3.5, section-sewn 4.32, section-sewn+perfect 6.75, perfect 9 (23–28 low qty),
hardcase 95. ⏳ page/qty-scaled perfect-binding curve + folding/die-cut rates (data has them
per-customer; need a canonical rule).

## 12. Coating Module — ✅ expanded
Options: Matt/Gloss lam, BOPP, Gloss UV (full), **Matt UV**, Gloss/Matt aqueous,
**Varnish**, Drip-off UV. Rate + job minimum each (Standard card / Anderson sources).
⏳ explicit per-coating setup vs running split (with #11).

## 13. Cover Embellishment Module — ✅ expanded
Up to **3 combinable** embellishments: Spot UV, **Raised/Textured UV**, Foil, Embossing,
**Debossing**, **Texture effect**, **Specialty finish**, Drip-off UV. Each priced (rate +
minimum) as a separate line on the cover sheets. ⏳ material/setup/running split (with #11).

## 14. Reporting & Quotation — ✅ done
Quote + internal job sheet show job/size/extent/qty, paper (type/GSM/parent/consumption),
printing (machine/colours/make-ready/running), **binding (type + spine + warnings)**,
finishing (coating + embellishments), and full cost summary
(paper/printing/binding/finishing/packing/freight/total/margin/GST/per-piece).

## 15. AI Rule Memory — ✅ ongoing
All production logic (binding, spine, paper/machine selection, wastage, costing, finishing)
recorded in the AI memory + this repo's `MASTER_PROJECT_STATE.md`, verified against sir's
hand numbers rather than relying on DB values alone.

---

## Remaining (need sir's input to finish 100%)
1. **Cutting diagram** in the job card (how the parent is cut into press-size pieces) — the
   cut MATH + cost is done; the visual cut layout drawing is still to add.
2. **Grain-direction compatibility** in sheet selection — need sir's grain rule.
3. **24pp / 32pp fold patterns** — need sir's hand-drawn forms (8/12/16pp already match).
4. **Digital press click-rate card** — digital currently uses offset rates; need ₹/click table.
