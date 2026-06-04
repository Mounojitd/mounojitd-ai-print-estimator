"""Paper calculation system (wire-o desk-calendar style, like NKK sir's reference).

Works in INCHES. For each candidate press-sheet size it computes ups (imposition),
sheets, wastage, weight, % efficiency, and — when a price lookup is supplied —
the real paper COST. Reports both the minimum-paper-usage sheet and the
minimum-cost sheet.

Terminology:  PAGE = one printed side.   LEAF = one sheet with 2 pages.

Model / assumptions (tune to match the shop):
  * cell (slug) on press = finished page + bleed on all sides.
  * gripper off the SHORTER edge; side-lay off each side of the longer edge.
  * gutter = space between adjacent cells (last cell needs no trailing gutter).
  * grain: 'either' tries both cell orientations (if rotation allowed);
    'long' locks the page upright; 'short' locks it rotated.
  * leaves/book = ceil(pages/2) double-sided, else pages.
  * sheets/book = ceil(leaves / ups);  good = sheets/book × books.
  * total = good + setup (make-ready) + running-waste%.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

MM = 25.4
DEFAULT_SHEETS_IN = [(18, 25), (20, 30), (23, 36), (25, 36), (30, 40)]


@dataclass
class SheetOption:
    sheet_w: float
    sheet_h: float
    ups: int = 0
    orientation: str = "—"
    sheets_per_book: int = 0
    good_sheets: int = 0
    setup_waste: int = 0
    running_waste: int = 0
    total_sheets: int = 0
    sheet_weight_kg: float = 0.0
    total_weight_kg: float = 0.0
    efficiency_pct: float = 0.0
    price_per_sheet: float | None = None     # real ₹/sheet from the master
    paper_cost: float | None = None          # ₹ for total_sheets
    paper_source: str | None = None          # paper_id / vendor used


def _ups(usable_long: float, usable_short: float, cw: float, ch: float,
         gutter: float, orientations: list[str]) -> tuple[int, str]:
    best, orient = 0, "—"
    for name in orientations:
        a, b = (cw, ch) if name == "upright" else (ch, cw)
        if a <= 0 or b <= 0:
            continue
        cols = int((usable_long + gutter) // (a + gutter))
        rows = int((usable_short + gutter) // (b + gutter))
        n = cols * rows
        if n > best:
            best, orient = n, name
    return best, orient


def compute(
    *,
    page_w: float, page_h: float,
    total_pages: int, books: int,
    double_sided: bool = True,
    bleed: float = 0.125,
    gutter: float = 0.0,
    grain: str = "either",                  # 'either' | 'long' | 'short'
    gripper_mm: float = 13.0,
    sidelay_mm: float = 3.0,
    allow_rotation: bool = False,
    gsm: int = 300,
    sheet_sizes: list[tuple[float, float]] | None = None,
    setup_waste: int = 100,
    running_pct: float = 5.0,
    price_fn: Callable[[float, float], tuple[float, str, str] | None] | None = None,
) -> dict:
    sheets = sheet_sizes or DEFAULT_SHEETS_IN
    gripper, sidelay = gripper_mm / MM, sidelay_mm / MM
    cell_w, cell_h = page_w + 2 * bleed, page_h + 2 * bleed
    leaves = max(1, total_pages if not double_sided else math.ceil(total_pages / 2))

    if grain == "long":
        orientations = ["upright"]
    elif grain == "short":
        orientations = ["rotated"]
    else:
        orientations = ["upright", "rotated"] if allow_rotation else ["upright"]

    options: list[SheetOption] = []
    for sw, sh in sheets:
        long_dim, short_dim = max(sw, sh), min(sw, sh)
        ups, orient = _ups(long_dim - 2 * sidelay, short_dim - gripper,
                            cell_w, cell_h, gutter, orientations)
        opt = SheetOption(sheet_w=sw, sheet_h=sh)
        if ups > 0:
            spb = math.ceil(leaves / ups)
            good = spb * books
            run = math.ceil(good * running_pct / 100.0)
            total = good + setup_waste + run
            area_m2 = (sw * 0.0254) * (sh * 0.0254)
            sheet_wt = area_m2 * gsm / 1000.0
            opt.ups = ups
            opt.orientation = orient
            opt.sheets_per_book = spb
            opt.good_sheets = good
            opt.setup_waste = setup_waste
            opt.running_waste = run
            opt.total_sheets = total
            opt.sheet_weight_kg = round(sheet_wt, 4)
            opt.total_weight_kg = round(sheet_wt * total, 2)
            opt.efficiency_pct = round(100.0 * ups * cell_w * cell_h / (sw * sh), 1)
            if price_fn:
                hit = price_fn(sw, sh)
                if hit:
                    price, pid, vendor = hit
                    opt.price_per_sheet = round(price, 4)
                    opt.paper_cost = round(price * total, 2)
                    opt.paper_source = f"{pid} · {vendor}"
        options.append(opt)

    usable = [o for o in options if o.ups > 0]
    best_paper = min(usable, key=lambda o: (o.total_sheets, o.sheet_w * o.sheet_h * o.total_sheets)) if usable else None
    priced = [o for o in usable if o.paper_cost is not None]
    best_cost = min(priced, key=lambda o: o.paper_cost) if priced else None

    return {
        "inputs": {
            "page": f"{page_w}×{page_h} in", "total_pages": total_pages, "books": books,
            "sided": "double" if double_sided else "single", "leaves_per_book": leaves,
            "bleed": bleed, "gutter": gutter, "grain": grain, "gripper_mm": gripper_mm,
            "sidelay_mm": sidelay_mm, "allow_rotation": allow_rotation, "gsm": gsm,
            "cell": f"{round(cell_w, 3)}×{round(cell_h, 3)} in (page + bleed)",
        },
        "options": [o.__dict__ for o in options],
        "best": best_paper.__dict__ if best_paper else None,        # minimum paper usage
        "best_cost": best_cost.__dict__ if best_cost else None,     # minimum ₹ (real master)
    }
