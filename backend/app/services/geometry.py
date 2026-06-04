"""Imposition geometry — the part NKK sir said to get right first.

Turns a finished page + signature into the flat sheet that goes on press, then
works out how many "ups" fit on the machine sheet (after gripper, side-lay,
colour-bar and trim/bleed allowances), trying both orientations.

v1 SIMPLIFIED MODEL — verify against real jobs and correct:
  * A signature of `signature_pages` pages prints on ONE sheet, both sides
    (work-and-turn assumed). Faces per side = signature_pages / 2.
  * Those faces tile in a near-square grid; the flat sheet = page × grid.
  * `ups` = how many whole signatures fit on the press sheet (both sides), so
    one press sheet yields `ups` copies of that signature.
"""
from __future__ import annotations

import math
from decimal import Decimal

from .estimation_config import (
    BLEED_MM,
    COLOR_BAR_MM,
    GRIPPER_MM,
    GUTTER_MM,
    SIDE_LAY_MM,
    TRIM_MARGIN_MM,
    D,
)
from .types import Size


def _grid(faces: int) -> tuple[int, int]:
    """(cols, rows) tiling `faces` page-faces with least waste, then squarest.

    e.g. 8 faces → 4×2 (exact), not 3×3 (one wasted). Orientation is decided
    later in fit_ups, so cols≥rows here is arbitrary.
    """
    if faces <= 1:
        return 1, 1
    best = None
    for cols in range(1, faces + 1):
        rows = math.ceil(faces / cols)
        waste = cols * rows - faces
        score = (waste, abs(cols - rows))     # prefer exact fit, then square
        if best is None or score < best[0]:
            best = (score, (cols, rows))
    return best[1]


def flat_for_grid(page: Size, cols: int, rows: int, trim: bool) -> Size:
    """Flat (untrimmed) press piece tiling cols×rows pages, incl. trim/bleed/gutter."""
    margin = (BLEED_MM if not trim else BLEED_MM + TRIM_MARGIN_MM)
    flat_w = (page.w + GUTTER_MM) * cols + margin
    flat_h = (page.h + GUTTER_MM) * rows + margin
    return Size(flat_w, flat_h)


def impose(sheet: Size, page: Size, signature_pages: int, trim: bool) -> tuple[int, str, Size]:
    """Best imposition of one signature on the sheet.

    Tries both grid arrangements (4×2 and 2×4) of the page-faces, and both sheet
    orientations (via fit_ups), keeping whichever yields the most ups.
    Returns (ups, note, flat_size). For a flat single sheet pass signature_pages=2.
    """
    faces_per_side = max(1, signature_pages // 2)
    c, r = _grid(faces_per_side)
    best: tuple[int, str, Size] | None = None
    for cc, rr in {(c, r), (r, c)}:
        flat = flat_for_grid(page, cc, rr, trim)
        ups, orient = fit_ups(sheet, flat)
        cand = (ups, f"{signature_pages}pp sig → {cc}×{rr} faces/side, {orient}", flat)
        if best is None or ups > best[0]:
            best = cand
    return best  # type: ignore[return-value]


def fit_ups(sheet: Size, piece: Size) -> tuple[int, str]:
    """Max pieces per press sheet after gripper/side-lay/colour-bar, both orients."""
    usable_h = sheet.h - GRIPPER_MM - COLOR_BAR_MM   # gripper + colour bar on one edge
    usable_w = sheet.w - SIDE_LAY_MM
    best, orient = 0, "n/a"
    for pw, ph, name in ((piece.w, piece.h, "portrait"), (piece.h, piece.w, "landscape")):
        if pw <= 0 or ph <= 0:
            continue
        cols = int(usable_w // pw)
        rows = int(usable_h // ph)
        ups = cols * rows
        if ups > best:
            best, orient = ups, f"{name} {cols}×{rows}"
    return best, orient


def plan_forms(pages: int, signature_pages: int) -> tuple[int, list[int]]:
    """Split `pages` into signatures. Returns (n_forms, [pages_per_form]).

    A signature is not breakable; a remainder folds as a smaller (4/2pp) form.
    """
    if pages <= 0:
        return 0, []
    full = pages // signature_pages
    rem = pages % signature_pages
    forms = [signature_pages] * full
    if rem:
        # round the broken form up to the nearest foldable unit (2,4,8,...)
        unit = 2
        while unit < rem:
            unit *= 2
        forms.append(min(unit, signature_pages))
    return len(forms), forms
