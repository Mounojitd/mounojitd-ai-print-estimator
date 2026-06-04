"""Step 1 — Paper calculation (wire-o desk-calendar style), like the reference
calculator NKK sir shared. Works in INCHES, finds the sheet size that gives the
MINIMUM paper usage, and reports ups / sheets / wastage / weight per sheet size.

Terminology (from the reference):
  PAGE = one printed side.   LEAF = one sheet with 2 pages.

Imposition model (assumptions noted; tune to match the shop):
  * cell (slug) on press = finished page + bleed on all sides.
  * gripper is taken off the SHORTER edge of the press sheet; side-lay off each
    side of the longer edge.
  * ups = how many cells tile the usable area (both cell orientations if rotation
    allowed).
  * leaves/book = ceil(pages/2) double-sided, or pages single-sided.
  * sheets/book = ceil(leaves / ups);  good sheets = sheets/book × books.
  * total = good + setup (make-ready) + running-waste%.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

MM = 25.4
DEFAULT_SHEETS_IN = [(18, 25), (20, 30), (25, 36), (30, 40)]


@dataclass
class SheetOption:
    sheet_w: float
    sheet_h: float
    ups: int
    orientation: str
    cell_w: float
    cell_h: float
    leaves_per_book: int
    sheets_per_book: int
    good_sheets: int
    setup_waste: int
    running_waste: int
    total_sheets: int
    sheet_weight_kg: float
    total_weight_kg: float
    paper_area_sqin: float       # total paper consumed
    efficiency_pct: float        # used cell area / sheet area


def _ups(usable_long: float, usable_short: float, cw: float, ch: float, rotate: bool) -> tuple[int, str]:
    best, orient = 0, "—"
    cands = [(cw, ch, "upright")]
    if rotate:
        cands.append((ch, cw, "rotated"))
    for a, b, name in cands:
        if a <= 0 or b <= 0:
            continue
        n = int(usable_long // a) * int(usable_short // b)
        if n > best:
            best, orient = n, name
    return best, orient


def compute(
    *,
    page_w: float, page_h: float,           # finished size, inches
    total_pages: int, books: int,
    double_sided: bool = True,
    bleed: float = 0.125,                    # inches
    safety: float = 0.125,                   # inches (keep-clear; informational)
    gripper_mm: float = 13.0,
    sidelay_mm: float = 3.0,
    allow_rotation: bool = False,
    gsm: int = 300,
    sheet_sizes: list[tuple[float, float]] | None = None,
    setup_waste: int = 100,
    running_pct: float = 5.0,
) -> dict:
    sheets = sheet_sizes or DEFAULT_SHEETS_IN
    gripper = gripper_mm / MM
    sidelay = sidelay_mm / MM
    cell_w = page_w + 2 * bleed
    cell_h = page_h + 2 * bleed
    leaves = total_pages if not double_sided else math.ceil(total_pages / 2)
    leaves = max(1, leaves)

    options: list[SheetOption] = []
    for sw, sh in sheets:
        long_dim, short_dim = max(sw, sh), min(sw, sh)
        usable_long = long_dim - 2 * sidelay          # side-lay both sides of long edge
        usable_short = short_dim - gripper            # gripper on the shorter edge
        ups, orient = _ups(usable_long, usable_short, cell_w, cell_h, allow_rotation)
        if ups <= 0:
            options.append(SheetOption(sw, sh, 0, "won't fit", cell_w, cell_h,
                                       leaves, 0, 0, 0, 0, 0, 0, 0, 0, 0))
            continue
        sheets_per_book = math.ceil(leaves / ups)
        good = sheets_per_book * books
        running = math.ceil(good * running_pct / 100.0)
        total = good + setup_waste + running
        area_sqin = sw * sh
        area_m2 = (sw * 0.0254) * (sh * 0.0254)
        sheet_wt = area_m2 * gsm / 1000.0
        options.append(SheetOption(
            sheet_w=sw, sheet_h=sh, ups=ups, orientation=orient,
            cell_w=round(cell_w, 3), cell_h=round(cell_h, 3),
            leaves_per_book=leaves, sheets_per_book=sheets_per_book,
            good_sheets=good, setup_waste=setup_waste, running_waste=running,
            total_sheets=total, sheet_weight_kg=round(sheet_wt, 4),
            total_weight_kg=round(sheet_wt * total, 2),
            paper_area_sqin=round(area_sqin * total, 1),
            efficiency_pct=round(100.0 * ups * cell_w * cell_h / area_sqin, 1),
        ))

    usable = [o for o in options if o.ups > 0]
    best = min(usable, key=lambda o: (o.total_sheets, o.paper_area_sqin)) if usable else None
    return {
        "inputs": {
            "page": f"{page_w}×{page_h} in", "total_pages": total_pages, "books": books,
            "sided": "double" if double_sided else "single", "leaves_per_book": leaves,
            "bleed": bleed, "safety": safety, "gripper_mm": gripper_mm,
            "sidelay_mm": sidelay_mm, "allow_rotation": allow_rotation, "gsm": gsm,
            "cell": f"{round(cell_w,3)}×{round(cell_h,3)} in (page + bleed)",
        },
        "options": [o.__dict__ for o in options],
        "best": best.__dict__ if best else None,
    }
