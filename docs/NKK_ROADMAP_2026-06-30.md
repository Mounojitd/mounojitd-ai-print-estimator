# NKK sir — strategy session (2026-06-30)

Decoded from the Hindi/English transcript. This is the end-to-end vision + the near-term build order.

## Status confirmed by sir
- Full **rate database** done with Manoj da (vendor sheets saved). Paper + coating rates wired.
- **Digital** 4-colour flat ₹/sheet wired (standard 18/22, special 30/35). **Single-colour digital rate = PENDING**
  — Manoj da will find & provide it; then add it.
- **Soft case** ✅, **hard case** ✅ (approved), **wire-o / spiral** ✅.

## Near-term (for Saturday testing — sir: "check thoroughly, give me day-after")
1. **Thorough check** of every product type — ✅ done (`tools/smoke_test_products.js`, 22/22 pass).
2. **Local save / export** — sir wants a **button → CSV → (auto) Google Sheet**. At minimum give CSV/local save
   so the data sits in one place. "zyada elaborate nahi hoga toh CSV export de hi dena."
3. **Document which DB feeds what** — tell sir exactly where each rate is fetched from.

## PHASE 1 — product breadth (sir's build order, "step by step")
1. ✅ Soft cover · ✅ Hard cover
2. ✅ **Back-to-back pasted book** — DONE (commit 3a6200a). Single-side-forms model: text PAPER (+weight)
   doubles (2 pasted sheets/leaf), printing/plates unchanged; 1st form = endpaper; cover scored + pasted;
   3-side trim (notes). Rates editable — NEEDS SIR'S HAND-NUMBER CHECK. (A full separate printed b2b cover
   component is still a follow-up — currently priced via the pasting/assembly labour line.)
3. ✅ **Sleeve / slipcase** — DONE (2026-07-03, sir's drawing p3). Product type "Slipcase / book sleeve":
   PLC wrap prints like a dieline blank (5-panel box: 2 faces + 2 sides + closed end), + chipboard (parent
   extraction) + inside-paper lining + making. Hard/soft toggle. slipcaseGeom/slipcasePlan + plan diagram
   (panels · score · turn-in). Verified ₹59–72/piece. NEEDS SIR'S HAND-NUMBER CHECK. TODO: bundling a slipcase
   WITH a book (sets), and per-panel (not area-based) board nesting if sir wants it.
4. ✅ **Sets / bundles** — DONE (2026-07-06). "🧺 Set / bundle builder" panel under the price: price any job →
   "Add current quote to set" (items persist in localStorage); per-item pcs/set; set assembly ₹/set;
   packing per sir = individual shrink-wrap ₹/pc + combined shrink-wrap ₹/set + poly-sleeve ₹/pc + carton
   (sets/carton × ₹/carton); SET TOTAL + per-set + printable set quotation. Verified: 2 items →
   ₹38,591 exact (items+assembly+shrink+poly+cartons). Rates editable — confirm with sir.
   (Export later: special carton, palletization.)
5. ✅ **Table calendar** — DONE (2026-07-06). Panel for product=Table calendar: wire-o **part (2 short
   pieces, default ₹8) / full (₹12)** + punching, and **tent back stand** = chip + PLC + backing-paper paste
   (surface ≈ 2.2 × leaf) + making. Defaults OFF so plain leaf jobs unchanged. tableCalPlan().
6. ✅ **Envelope gusset** — DONE. C-field = gusset depth (0 = flat): blank grows +2×gusset W, +1×gusset H
   (9×4 flap 1.5: flat 10×7 → gusset-2 14×9). Verified.
7. ✅ **Mono carton** — DONE. Two styles: **tuck-end** (carton_tuck, "Carton / mono carton (tuck-end)") and
   **seal-end / glued bottom** (carton_seal, added 2026-07-06: blank bh=C+2.5·B, "glued bottom seal" in the
   diagram; gluing priced via the dieline glue rate). Both flow through the dieline engine.
8. ✅ **Local CSV save** — DONE. "💾 Save quote (CSV + log)" downloads the current quote as CSV AND appends a
   summary row to a local quote log (localStorage QUOTE_LOG); "📤 Export all saved quotes (CSV)" downloads the
   whole log — paste straight into a Google Sheet. (Auto Google-Sheet push needs internet/Apps-Script — later.)

## PHASE 2 — templates / masters ✅ DONE (2026-07-06, commit 917b2e7)
"📁 Templates / masters" panel under the price. Name a job + **Save current as template** → snapshots ALL
inputs (snapshotInputs). Searchable list with **Open** (restoreInputs → product/size/paper/pages/colours/
binding restored + re-run) and delete. **Export/Import** templates as JSON so masters move between devices.
Stored in localStorage (TEMPLATES). Central/shared templates come with the phase-4 backend (localStorage is
per-device; export/import bridges devices for now). Verified: save/filter/open-restores/export/import-dedupe/
delete. NEXT: phase 3 (historical job DB + smart suggestion), phase 4 (AI loop + web/app + lead capture).

## PHASE 3 — historical job DB + smart suggestion
Store past jobs; suggest closest match.

## PHASE 4 — AI loop + web/app + lead capture
Describe a job in words → AI loops, finds best-match template, narrows down (shows 8–10, user picks) →
costing. Then website + downloadable app; **lead capture** (data comes to us centrally, NOT local-only);
"someone starts calculating a book → we get notified → sales follow-up." Full end-to-end system, not just an
estimator.

## Open pending (sir's numbers)
- Digital **single-colour** ₹/sheet (Manoj da). Hard-case material rates (rexine/cloth/velvet, headband/ribbon,
  board grade+size, spine-board reduction). Press-rate & binding overrides in the master sheet.
