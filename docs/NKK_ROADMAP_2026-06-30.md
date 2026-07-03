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
3. **Sleeve / slipcase** — NEW component. **Chipboard + PLC (cut to shape) + inside-paper pasting** (so raw
   board doesn't show; no endpaper). Can be **hard or soft**. Standalone OR **bundled** with a book (any book:
   soft/hard/b2b). Components: chip, PLC, inside paste.
4. **Sets / bundles** — cost each item separately, then bundle into a set (e.g. school forms: 8–10 form types).
   Packing options to ADD: ① individual shrink-wrap + combined shrink-wrap, ② individual poly-sleeve insertion,
   then standard carton packing. (Export later: special carton, palletization.)
5. **Table calendar** — leaves (separate) + **wire-o** (part-wiro OR full-wiro) + **back stand** (chip + PLC +
   backing-paper paste — same as sleeve/hard-case build).
6. **Envelope** — add **gusseted** vs non-gusseted (I built basic non-gusseted). Printed on a bigger rectangular
   blank, folded (flaps) + pasted.
7. **Mono carton** — die-cut + score + fold + paste + **bottom sealing** (2–3 carton styles). Printed on board
   (rectangular, small ones gang), then **die** (cut + score + fold-crease together), strip, paste.

## PHASE 2 — templates / masters
Save any filled job as a named **template/master** (like an Excel master). "Open a template for a hard case
book" / "for XYZ company's hard case book" / "what templates exist for hard case?" → open, tweak size/paper/
pages → quotation. Requires save + list + open templates.

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
