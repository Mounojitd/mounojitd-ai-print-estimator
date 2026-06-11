# NKK Sir's Estimation Process (transcribed from his voice notes)

> Source: NKK sir's two recordings — 2026-06-02 (full logic) and 2026-06-08 (review of
> the live app, with corrections). Written in his order. This is HIS method — the
> "single source of truth" for the calculation logic.

---

## STEP 0 — Inputs you must collect

1. **Finished / folded size** — always a rectangle, **height × width**. Three cases:
   - Single sheet → finished size = open size.
   - Folded (leaflet) → folded (closed) size + open size.
   - Booklet (multiple forms stitched) → it has a **closed size AND an open size**.
2. **Open (left-side) size** — the flat/spread size. Depends on folds & panels
   (1 fold = 2 panels, 3-fold, multi-fold = 6/12 panels, etc.).
3. **GSM** of the paper.
4. **Type of paper.**
5. **Extent (number of pages).** Remember: **1 leaf = 2 pages.** State printed one side
   or both sides.
6. **Binding type** — saddle stitch (centre pinning), perfect binding, section sewing,
   wire-o / spiral / comb, pad binding, case binding, back-to-back pasting, calendar
   mounting, etc. Cover and text are separate components.
7. **Trim or no-trim.**

---

## STEP 1 — PAPER CALCULATION (the most important; "once this is set, the rest is easy")

1. **Orientation → open size (auto).** Ask portrait or landscape; the system then
   **auto-calculates the open/spread size**. Example: a booklet 7 × 9.5 (closed),
   portrait → **double the 7 → 14 × 9.5 open**. Landscape → double the other side.
   *(June-8 correction: the app was wrongly using the single page width — "you cut the
   spread… you have to find the size of the spread.")*

2. **Folding / signature logic.** You **choose the signature**: 4, 8, 16, or **32 pages
   (32 is the maximum — we don't do 64)**. Then **pages ÷ signature = number of
   signatures = number of sheets per book.** Example: 80 pages ÷ 16 = **5 signatures =
   5 sheets**. (16pp signature = 8 pages front + 8 back, work-and-turn.) If pages don't
   divide evenly (e.g. 88), one sheet is a half/broken signature — calculate that too.

3. **Add the margins — all in mm:**
   - **Trim margin** — 3 mm (design trim).
   - **Bleed** — 3 mm.
   - **Backside / back-of-paper** — 3 mm (the edge opposite the gripper). *(June-8: the
     app was missing this one.)*
   - **Gripper** — **10 mm**, on the gripper (short) side. *(June-8: corrected from 13 to 10.)*
   - **Side-lay** — 3 mm each side.
   - **Paper trim margin** — **3 mm on all four sides**, because when you take 20×30 stock
     to print you cut/trim it from all sides. This is separate from design trim.
   - **Do all of this in millimetres** — don't mix mm and inches.

4. **Fit / ups.** Work out how many fit on the press sheet — test **normal and rotated**
   placement; choose the **best fit / least waste**.

5. **If it doesn't fit — don't fail. Suggest:** "reduce by 1 mm / 2 mm / 5 mm" (within the
   margin) to get the best paper, OR use the next larger sheet, OR use a different machine.

6. **Sheet availability & cutting.** You don't have to take the stock as-is — you can
   **cut a bigger sheet down**: a 30×40 can be cut to 20×30, or 15×20, etc. Match to
   what's actually available.

7. **Wastage / spoilage.** Two parts:
   - **Setup / make-ready** = a **fixed number of sheets** per plate/forme change (same
     whether you run 10 or 10,000).
   - **Running waste** = a **percentage** of the run (drops as quantity rises).
   - Build a table by process (offset/digital), machine, and quantity.

8. **Paper cost.** The masters carry **both per-sheet and per-kg** — calculate it
   **both ways** (back-calculate from whichever is given). Get the **weight** from
   GSM × area.

9. **Work-and-turn vs work-and-tumble** — handle both (turn the sheet vs tumble it).

---

## STEP 2 — MACHINE CALCULATION

1. **Check machine availability** — there are several presses (20×30, 30×40, 28×40,
   25×36, 28×25, etc., across 5–6 sites).
2. For each machine know: **gripper size, max print area, max paper size, min paper
   size** (you can't cut to tiny 2-inch pieces — there's a minimum standard).
3. **Which machine can run this sheet?** ("This job, this machine is available, and this
   one too — which suits best?")
4. **Recommend the best fit**, show the price, **compare**. There is a default selection,
   but **show which machine is the best fit** for this paper. Machine availability matters
   — if the best machine isn't free, the user can choose another.

---

## STEP 3 — COLOUR CALCULATION

1. **Colours** — normally **4+4 (CMYK) as the default**, but allow any combination:
   1+0, 1+1, 2+2, 2+4, 4+0, etc., plus a **5th / 6th spot colour** (special / extra).
2. **Check machine colour capacity** (1-col, 2-col, 4-col, 5-col machine). If you have a
   1-colour job but run it on a 4-colour machine → fewer plates, less cost — the system
   should account for that.

---

## STEP 4 — PLATE + IMPRESSION (done separately)

1. **Plate calculation — separate.** Per colour, per forme: whatever colour, whatever
   plate, whatever forme → that many plates.
2. **Impression calculation — separate.** There is a **minimum charge** (one print, or
   1,000, is the minimum rate). **0–2,000 = the same (minimum) rate; after 2,000/3,000
   there's an additional recurring rate** per extra.

> "Once you've done paper, machine, and colour clearly — with all spoilages — that's the
> most important part. After that the rest is very easy."

---

## STEP 5 — THE REST (NKK sir: "very easy after the above")

1. **Weight** of the finished book/item (grammage × size).
2. **Packing** — how many cartons, carton size, packing cost.
3. **Freight** cost.
4. **Overhead** — 12%.
5. **Margin** — standard; the master can reduce it to win the job.
6. **GST.**
7. **Generate the estimate / quotation**, then the **job sheet / production sheet**, and
   eventually **signature planning** — so that just by saying a few things
   ("16-page A4 booklet, self-cover, 200 copies, 4-colour, 170 gsm, hardbound") the
   system gives everything ready.

---

## NKK sir's working method

- "Make the algorithm, then **test it manually — 2, 4, 10 times — until it's perfect.**
  Then the algorithm is set."
- "It's not difficult at all — you just have to set the logic properly. Once the logic is
  right, AI can do the rest."
