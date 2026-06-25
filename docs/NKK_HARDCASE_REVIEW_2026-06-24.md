# NKK sir — Hard Case review (2026-06-24)

Source: WhatsApp audio transcript + 5 hand-drawn pages (`docs/nkk_hardcase_2026-06-24/`).
Job under review: 8.5 × 10.75 in, 80pp, 1000 copies, separate cover, coated 300gsm, hard case.

## Drawings → meaning
- **p1** — Cover **Work & Turn**: Spine/Front panels, inside back/front (`B/2x`, `F/2x`), gripper edge.
- **p2** — A=Text(soft case) · B=**Chip** (boards + spine, 3mm overhang, 8mm joint, extract from big parent board) · C=PLC.
- **p3** — C=PLC **15mm turn-in** on all 4 sides, 8mm spine · D=**End paper** (2× folded 4pp leaves).
- **p4** — E=Header · A=**Case making** (PLC + boards, cut corners, fold) · G=**Text block** (fold→gather→sew→3-knife).
- **p5** — Casing-in (+ pressure) · H=Curing.

## Actionable items (priority order)
1. **[#7 endpaper price BUG]** auto price came out too low — area-scaled the parent rate down to the small piece.
   FIX: buy parent sheets at the real GSM list price, cut N endpapers/sheet (parent extraction). **DONE — see endpaperCost.**
2. **[#1 soft-case Inside/Text diagram]** shows one finished page (8.5×10.75) but must show the **open 2-page spread**
   folding from the **middle**. The single-page-with-fold is geometrically wrong.
3. **[#2 cover diagram]** must show **Work & Turn** + the **gripper on the correct edge** (currently wrong side / white gap).
4. **[#3 finishing make-ready]** finishing wastage must **add into the initial print spoilage** (print extra up front),
   not sit as a loose paper line. (need 1000 + 150 print waste + 50 finish waste → run more.)
5. **[#4/#5 chip/board]** parent-purchase the board from a **board parent sheet in the DB** (N boards/parent → cost),
   board **rate from DB** not manual; chip diagram: finished chip = finished book + **3mm overhang ×3 sides** + **8mm
   joint** on spine; spine board slightly **smaller** than spine (5.2mm display too thin).
6. **[#6 PLC]** finished PLC = chip case-open **+ 15mm turn-in ×4 sides**, then extract raw paper like the cover
   (gripper/side-lay/bleed/parent). Needs its own diagram.
7. **[#8 endpaper printed toggle]** endpaper may be **printed or non-printed** — if printed, add colours + machine;
   if not, just buy + cut.

## Also noted (soft case, mostly fine)
- Cover should be linkable to a small press (cover machine choice) — already implemented.
- 130gsm DB add, GSM substitution honesty — already implemented.
- Glue = consumable, folded into case-making charge (not a separate line). OK as-is.
- Text/inside = same as soft case (no change to text block).

## Status (updated)
- ✅ #7 endpaper price bug — parent-sheet extraction (`endpaperCost`), commit b1c9d46.
- ✅ #1 Inside/Text diagram — open 2-page spread folding from the middle, b1c9d46.
- ✅ #2 cover diagram — Work & Turn (mirrored inside) + gripper bar, b1c9d46.
- ✅ #4/#5 chip — parent-board extraction (hcBoardParentW/H, perCover/perSpine), commit 401df29.
- ⬜ #3 finishing make-ready → fold into initial print spoilage (run more up front).
- ⬜ #6 PLC — dedicated flat-blank diagram (costing already correct: caseOpen + 15mm turn-in).
- ⬜ #8 endpaper printed/non-printed toggle (+ colours/machine if printed).
